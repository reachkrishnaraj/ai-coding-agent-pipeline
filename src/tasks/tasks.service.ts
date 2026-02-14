import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Task, TaskDocument } from '../common/schemas/task.schema';
import { TaskStatus } from '../common/enums/task-status.enum';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import type { ILlmService } from '../common/interfaces/llm.service.interface';
import type { IGitHubService } from '../common/interfaces/github.service.interface';

@Injectable()
export class TasksService {
  private readonly llmService: ILlmService;
  private readonly githubService: IGitHubService;

  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectConnection() private connection: Connection,
    @Inject('ILlmService') llmService: any,
    @Inject('IGitHubService') githubService: any,
    @Optional()
    @Inject('SlackNotificationService')
    private readonly slackNotificationService?: any,
  ) {
    this.llmService = llmService;
    this.githubService = githubService;
  }

  // State machine: valid transitions
  private readonly validTransitions: Record<string, string[]> = {
    [TaskStatus.RECEIVED]: [TaskStatus.ANALYZING, TaskStatus.FAILED],
    [TaskStatus.ANALYZING]: [
      TaskStatus.NEEDS_CLARIFICATION,
      TaskStatus.DISPATCHED,
      TaskStatus.FAILED,
    ],
    [TaskStatus.NEEDS_CLARIFICATION]: [TaskStatus.DISPATCHED, TaskStatus.FAILED],
    [TaskStatus.DISPATCHED]: [TaskStatus.CODING, TaskStatus.FAILED],
    [TaskStatus.CODING]: [TaskStatus.PR_OPEN, TaskStatus.FAILED],
    [TaskStatus.PR_OPEN]: [TaskStatus.MERGED, TaskStatus.FAILED],
    [TaskStatus.MERGED]: [],
    [TaskStatus.FAILED]: [TaskStatus.RECEIVED], // Allow retry
  };

  private validateTransition(currentStatus: string, newStatus: string): void {
    const allowedTransitions = this.validTransitions[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
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
    await this.taskModel.findByIdAndUpdate(taskId, {
      $push: {
        events: { eventType, payload: payload || {}, createdAt: new Date() },
      },
    }).exec();
  }

  async create(dto: CreateTaskDto) {
    // 1. Create task with status "received"
    const task = new this.taskModel({
      source: dto.source || 'api',
      description: dto.description,
      taskTypeHint: dto.type,
      repo: dto.repo || 'mothership/finance-service',
      filesHint: dto.files,
      acceptanceCriteria: dto.acceptanceCriteria,
      priority: dto.priority || 'normal',
      createdBy: dto.createdBy,
      status: TaskStatus.RECEIVED,
      events: [],
    });
    await task.save();

    const taskId = task._id.toString();

    // 2. Log "created" event
    await this.logEvent(taskId, 'created', { taskId });

    // 3. Update status to "analyzing"
    this.validateTransition(task.status, TaskStatus.ANALYZING);
    await this.taskModel.findByIdAndUpdate(taskId, {
      $set: { status: TaskStatus.ANALYZING },
    }).exec();
    await this.logEvent(taskId, 'analyzing');

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
      await this.taskModel.findByIdAndUpdate(taskId, {
        $set: {
          llmAnalysis: analysis,
          llmSummary: analysis.summary,
          taskType: analysis.task_type,
          recommendedAgent: analysis.recommended_agent,
          likelyFiles: analysis.likely_files,
          suggestedCriteria: analysis.suggested_acceptance_criteria,
          clarificationQuestions: analysis.questions,
        },
      }).exec();

      await this.logEvent(taskId, 'llm_response', { analysis });

      // 6. If clear_enough=true: create GitHub issue
      if (analysis.clear_enough) {
        return await this.dispatchTask(taskId, analysis);
      } else {
        // 7. If clear_enough=false: update status to needs_clarification
        this.validateTransition(TaskStatus.ANALYZING, TaskStatus.NEEDS_CLARIFICATION);
        const updatedTask = await this.taskModel.findByIdAndUpdate(
          taskId,
          { $set: { status: TaskStatus.NEEDS_CLARIFICATION } },
          { new: true },
        ).exec();

        await this.logEvent(taskId, 'clarification_sent', {
          questions: analysis.questions,
        });

        return {
          ...updatedTask?.toJSON(),
          questions: analysis.questions,
        };
      }
    } catch (error) {
      // On error, transition to failed
      this.validateTransition(task.status, TaskStatus.FAILED);
      await this.taskModel.findByIdAndUpdate(taskId, {
        $set: {
          status: TaskStatus.FAILED,
          errorMessage: error.message,
        },
      }).exec();
      await this.logEvent(taskId, 'failed', { error: error.message });
      throw error;
    }
  }

  async clarify(id: string, dto: ClarifyTaskDto) {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== TaskStatus.NEEDS_CLARIFICATION) {
      throw new BadRequestException(
        `Task is not in needs_clarification status. Current status: ${task.status}`,
      );
    }

    // Save answers
    await this.taskModel.findByIdAndUpdate(id, {
      $set: {
        clarificationAnswers: dto.answers,
        isClarified: true,
      },
    }).exec();

    await this.logEvent(id, 'clarification_received', { answers: dto.answers });

    // Re-analyze with Q&A appended
    const questions = task.clarificationQuestions || [];
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
      await this.taskModel.findByIdAndUpdate(id, {
        $set: {
          llmAnalysis: analysis,
          llmSummary: analysis.summary,
          taskType: analysis.task_type,
          recommendedAgent: analysis.recommended_agent,
          likelyFiles: analysis.likely_files,
          suggestedCriteria: analysis.suggested_acceptance_criteria,
        },
      }).exec();

      // Dispatch to GitHub
      return await this.dispatchTask(id, analysis);
    } catch (error) {
      this.validateTransition(task.status, TaskStatus.FAILED);
      await this.taskModel.findByIdAndUpdate(id, {
        $set: {
          status: TaskStatus.FAILED,
          errorMessage: error.message,
        },
      }).exec();
      await this.logEvent(id, 'failed', { error: error.message });
      throw error;
    }
  }

  private async dispatchTask(taskId: string, analysis: any) {
    const task = await this.taskModel.findById(taskId).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    this.validateTransition(task.status, TaskStatus.DISPATCHED);

    // Create GitHub Issue
    const issue = await this.githubService.createIssue(
      {
        id: taskId,
        description: task.description,
        repo: task.repo ?? 'mothership/unknown',
        acceptance_criteria: task.acceptanceCriteria ?? undefined,
        clarificationQuestions: task.clarificationQuestions ?? undefined,
        clarificationAnswers: task.clarificationAnswers ?? undefined,
      },
      analysis,
    );

    // Update task with GitHub info
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        $set: {
          status: TaskStatus.DISPATCHED,
          githubIssueNumber: issue.issueNumber,
          githubIssueUrl: issue.htmlUrl,
          dispatchedAt: new Date(),
        },
      },
      { new: true },
    ).exec();

    await this.logEvent(taskId, 'dispatched', {
      issueNumber: issue.issueNumber,
      issueUrl: issue.htmlUrl,
    });

    // Send Slack notification if available
    if (this.slackNotificationService) {
      await this.slackNotificationService.notifyTaskDispatched(taskId);
    }

    return {
      ...updatedTask?.toJSON(),
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
      this.taskModel.find(where).skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.taskModel.countDocuments(where).exec(),
    ]);

    return {
      tasks: tasks.map(t => t.toJSON()),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string) {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task.toJSON();
  }

  async retry(id: string) {
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== TaskStatus.FAILED) {
      throw new BadRequestException('Only failed tasks can be retried');
    }

    // Reset to received and re-run the flow
    this.validateTransition(task.status, TaskStatus.RECEIVED);
    await this.taskModel.findByIdAndUpdate(id, {
      $set: {
        status: TaskStatus.RECEIVED,
        errorMessage: null,
      },
    }).exec();

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
    const task = await this.taskModel.findById(id).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Can only cancel if not yet dispatched
    const cancellableStatuses: string[] = [
      TaskStatus.RECEIVED,
      TaskStatus.ANALYZING,
      TaskStatus.NEEDS_CLARIFICATION,
    ];

    if (!cancellableStatuses.includes(task.status)) {
      throw new BadRequestException(
        `Cannot cancel task in status: ${task.status}`,
      );
    }

    await this.taskModel.findByIdAndDelete(id).exec();

    await this.logEvent(id, 'cancelled');

    return { message: 'Task cancelled successfully' };
  }

  async getHealth() {
    try {
      const db = this.connection.db;
      if (db) {
        await db.admin().ping();
      }
      return { status: 'ok', db: 'connected' };
    } catch (error) {
      return { status: 'error', db: 'disconnected', error: error.message };
    }
  }

  // Helper methods for Slack webhook controller
  async updateSlackInfo(taskId: string, slackUserId: string, slackChannelId: string) {
    return this.taskModel.findByIdAndUpdate(
      taskId,
      { $set: { slackUserId, slackChannelId } },
      { new: true },
    ).exec();
  }

  async updateSlackThreadTs(taskId: string, threadTs: string) {
    return this.taskModel.findByIdAndUpdate(
      taskId,
      { $set: { slackThreadTs: threadTs } },
      { new: true },
    ).exec();
  }

  async findBySlackThread(threadTs: string) {
    return this.taskModel.findOne({
      slackThreadTs: threadTs,
      status: TaskStatus.NEEDS_CLARIFICATION,
    }).exec();
  }
}
