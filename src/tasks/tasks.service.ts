import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import type { ILlmService } from '../common/interfaces/llm.service.interface';
import type { IGitHubService } from '../common/interfaces/github.service.interface';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  private readonly llmService: ILlmService;
  private readonly githubService: IGitHubService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('ILlmService') llmService: any,
    @Inject('IGitHubService') githubService: any,
    @Optional() @Inject('SlackNotificationService') private readonly slackNotificationService?: any,
  ) {
    this.llmService = llmService;
    this.githubService = githubService;
  }

  // State machine: valid transitions
  private readonly validTransitions: Record<TaskStatus, TaskStatus[]> = {
    received: [TaskStatus.analyzing, TaskStatus.failed],
    analyzing: [
      TaskStatus.needs_clarification,
      TaskStatus.dispatched,
      TaskStatus.failed,
    ],
    needs_clarification: [TaskStatus.dispatched, TaskStatus.failed],
    dispatched: [TaskStatus.coding, TaskStatus.failed],
    coding: [TaskStatus.pr_open, TaskStatus.failed],
    pr_open: [TaskStatus.merged, TaskStatus.failed],
    merged: [],
    failed: [TaskStatus.received], // Allow retry
  };

  private validateTransition(
    currentStatus: TaskStatus,
    newStatus: TaskStatus,
  ): void {
    const allowedTransitions = this.validTransitions[currentStatus];
    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid state transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  private async logEvent(
    taskId: string,
    eventType: string,
    payload?: any,
  ): Promise<void> {
    await this.prisma.taskEvent.create({
      data: {
        taskId,
        eventType,
        payload: payload || {},
      },
    });
  }

  async create(dto: CreateTaskDto) {
    // 1. Create task with status "received"
    const task = await this.prisma.task.create({
      data: {
        source: dto.source || 'api',
        description: dto.description,
        taskTypeHint: dto.type,
        repo: dto.repo || 'mothership/finance-service',
        filesHint: dto.files,
        acceptanceCriteria: dto.acceptanceCriteria,
        priority: dto.priority || 'normal',
        createdBy: dto.createdBy,
        status: TaskStatus.received,
      },
    });

    // 2. Log "created" event
    await this.logEvent(task.id, 'created', { taskId: task.id });

    // 3. Update status to "analyzing"
    this.validateTransition(task.status, TaskStatus.analyzing);
    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: TaskStatus.analyzing },
    });
    await this.logEvent(task.id, 'analyzing');

    try {
      // 4. Call LLM service to analyze
      const analysis = await this.llmService.analyzeTask({
        description: dto.description,
        task_type_hint: dto.type,
        repo: dto.repo,
        files_hint: dto.files,
        acceptance_criteria: dto.acceptanceCriteria,
      });

      // 5. Save LLM analysis
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          llmAnalysis: analysis as any,
          llmSummary: analysis.summary,
          taskType: analysis.task_type,
          recommendedAgent: analysis.recommended_agent,
          likelyFiles: analysis.likely_files as any,
          suggestedCriteria: analysis.suggested_acceptance_criteria as any,
          clarificationQuestions: analysis.questions as any,
        },
      });

      await this.logEvent(task.id, 'llm_response', { analysis });

      // 6. If clear_enough=true: create GitHub issue
      if (analysis.clear_enough) {
        return await this.dispatchTask(task.id, analysis);
      } else {
        // 7. If clear_enough=false: update status to needs_clarification
        this.validateTransition(TaskStatus.analyzing, TaskStatus.needs_clarification);
        const updatedTask = await this.prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.needs_clarification },
        });

        await this.logEvent(task.id, 'clarification_sent', {
          questions: analysis.questions,
        });

        return {
          ...updatedTask,
          questions: analysis.questions,
        };
      }
    } catch (error) {
      // On error, transition to failed
      this.validateTransition(task.status, TaskStatus.failed);
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.failed,
          errorMessage: error.message,
        },
      });
      await this.logEvent(task.id, 'failed', { error: error.message });
      throw error;
    }
  }

  async clarify(id: string, dto: ClarifyTaskDto) {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== TaskStatus.needs_clarification) {
      throw new BadRequestException(
        `Task is not in needs_clarification status. Current status: ${task.status}`,
      );
    }

    // Save answers
    await this.prisma.task.update({
      where: { id },
      data: {
        clarificationAnswers: dto.answers as any,
        isClarified: true,
      },
    });

    await this.logEvent(id, 'clarification_received', { answers: dto.answers });

    // Re-analyze with Q&A appended
    const questions = (task.clarificationQuestions as string[]) || [];
    const clarificationQA = questions.map((q, i) => ({
      question: q,
      answer: dto.answers[i],
    }));

    try {
      const analysis = await this.llmService.analyzeTask({
        description: task.description,
        task_type_hint: task.taskTypeHint ?? undefined,
        repo: task.repo ?? undefined,
        files_hint: task.filesHint ?? undefined,
        acceptance_criteria: task.acceptanceCriteria ?? undefined,
        clarificationQA,
      });

      // Update with new analysis
      await this.prisma.task.update({
        where: { id },
        data: {
          llmAnalysis: analysis as any,
          llmSummary: analysis.summary,
          taskType: analysis.task_type,
          recommendedAgent: analysis.recommended_agent,
          likelyFiles: analysis.likely_files as any,
          suggestedCriteria: analysis.suggested_acceptance_criteria as any,
        },
      });

      // Dispatch to GitHub
      return await this.dispatchTask(id, analysis);
    } catch (error) {
      this.validateTransition(task.status, TaskStatus.failed);
      await this.prisma.task.update({
        where: { id },
        data: {
          status: TaskStatus.failed,
          errorMessage: error.message,
        },
      });
      await this.logEvent(id, 'failed', { error: error.message });
      throw error;
    }
  }

  private async dispatchTask(taskId: string, analysis: any) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    this.validateTransition(task.status, TaskStatus.dispatched);

    // Create GitHub Issue
    const issue = await this.githubService.createIssue(
      {
        id: task.id,
        description: task.description,
        repo: task.repo ?? 'mothership/unknown',
        acceptance_criteria: task.acceptanceCriteria ?? undefined,
        clarificationQuestions: (task.clarificationQuestions as string[]) ?? undefined,
        clarificationAnswers: (task.clarificationAnswers as string[]) ?? undefined,
      },
      analysis,
    );

    // Update task with GitHub info
    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.dispatched,
        githubIssueNumber: issue.issueNumber,
        githubIssueUrl: issue.htmlUrl,
        dispatchedAt: new Date(),
      },
    });

    await this.logEvent(taskId, 'dispatched', {
      issueNumber: issue.issueNumber,
      issueUrl: issue.htmlUrl,
    });

    // Send Slack notification if available
    if (this.slackNotificationService) {
      await this.slackNotificationService.notifyTaskDispatched(taskId);
    }

    return {
      ...updatedTask,
      issue_url: issue.htmlUrl,
      issue_number: issue.issueNumber,
      agent: analysis.recommended_agent,
      task_type: analysis.task_type,
    };
  }

  async findAll(query: TaskQueryDto) {
    const { page = 1, limit = 20, status, repo } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (repo) {
      where.repo = repo;
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      tasks,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async retry(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== TaskStatus.failed) {
      throw new BadRequestException('Only failed tasks can be retried');
    }

    // Reset to received and re-run the flow
    this.validateTransition(task.status, TaskStatus.received);
    await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.received,
        errorMessage: null,
      },
    });

    await this.logEvent(id, 'retry_requested');

    // Re-run the analysis flow
    return this.create({
      description: task.description,
      type: task.taskTypeHint ?? undefined,
      repo: task.repo ?? undefined,
      files: task.filesHint ?? undefined,
      acceptanceCriteria: task.acceptanceCriteria ?? undefined,
      priority: (task.priority as 'normal' | 'urgent') ?? undefined,
      source: task.source ?? undefined,
      createdBy: task.createdBy ?? undefined,
    });
  }

  async cancel(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Can only cancel if not yet dispatched
    const cancellableStatuses: TaskStatus[] = [
      TaskStatus.received,
      TaskStatus.analyzing,
      TaskStatus.needs_clarification,
    ];

    if (!cancellableStatuses.includes(task.status)) {
      throw new BadRequestException(
        `Cannot cancel task in status: ${task.status}`,
      );
    }

    await this.prisma.task.delete({
      where: { id },
    });

    await this.logEvent(id, 'cancelled');

    return { message: 'Task cancelled successfully' };
  }

  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'connected' };
    } catch (error) {
      return { status: 'error', db: 'disconnected', error: error.message };
    }
  }
}
