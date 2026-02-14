"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let TasksService = class TasksService {
    prisma;
    slackNotificationService;
    llmService;
    githubService;
    constructor(prisma, llmService, githubService, slackNotificationService) {
        this.prisma = prisma;
        this.slackNotificationService = slackNotificationService;
        this.llmService = llmService;
        this.githubService = githubService;
    }
    validTransitions = {
        received: [client_1.TaskStatus.analyzing, client_1.TaskStatus.failed],
        analyzing: [
            client_1.TaskStatus.needs_clarification,
            client_1.TaskStatus.dispatched,
            client_1.TaskStatus.failed,
        ],
        needs_clarification: [client_1.TaskStatus.dispatched, client_1.TaskStatus.failed],
        dispatched: [client_1.TaskStatus.coding, client_1.TaskStatus.failed],
        coding: [client_1.TaskStatus.pr_open, client_1.TaskStatus.failed],
        pr_open: [client_1.TaskStatus.merged, client_1.TaskStatus.failed],
        merged: [],
        failed: [client_1.TaskStatus.received],
    };
    validateTransition(currentStatus, newStatus) {
        const allowedTransitions = this.validTransitions[currentStatus];
        if (!allowedTransitions.includes(newStatus)) {
            throw new common_1.BadRequestException(`Invalid state transition from ${currentStatus} to ${newStatus}`);
        }
    }
    async logEvent(taskId, eventType, payload) {
        await this.prisma.taskEvent.create({
            data: {
                taskId,
                eventType,
                payload: payload || {},
            },
        });
    }
    async create(dto) {
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
                status: client_1.TaskStatus.received,
            },
        });
        await this.logEvent(task.id, 'created', { taskId: task.id });
        this.validateTransition(task.status, client_1.TaskStatus.analyzing);
        await this.prisma.task.update({
            where: { id: task.id },
            data: { status: client_1.TaskStatus.analyzing },
        });
        await this.logEvent(task.id, 'analyzing');
        try {
            const analysis = await this.llmService.analyzeTask({
                description: dto.description,
                task_type_hint: dto.type,
                repo: dto.repo,
                files_hint: dto.files,
                acceptance_criteria: dto.acceptanceCriteria,
            });
            await this.prisma.task.update({
                where: { id: task.id },
                data: {
                    llmAnalysis: analysis,
                    llmSummary: analysis.summary,
                    taskType: analysis.task_type,
                    recommendedAgent: analysis.recommended_agent,
                    likelyFiles: analysis.likely_files,
                    suggestedCriteria: analysis.suggested_acceptance_criteria,
                    clarificationQuestions: analysis.questions,
                },
            });
            await this.logEvent(task.id, 'llm_response', { analysis });
            if (analysis.clear_enough) {
                return await this.dispatchTask(task.id, analysis);
            }
            else {
                this.validateTransition(client_1.TaskStatus.analyzing, client_1.TaskStatus.needs_clarification);
                const updatedTask = await this.prisma.task.update({
                    where: { id: task.id },
                    data: { status: client_1.TaskStatus.needs_clarification },
                });
                await this.logEvent(task.id, 'clarification_sent', {
                    questions: analysis.questions,
                });
                return {
                    ...updatedTask,
                    questions: analysis.questions,
                };
            }
        }
        catch (error) {
            this.validateTransition(task.status, client_1.TaskStatus.failed);
            await this.prisma.task.update({
                where: { id: task.id },
                data: {
                    status: client_1.TaskStatus.failed,
                    errorMessage: error.message,
                },
            });
            await this.logEvent(task.id, 'failed', { error: error.message });
            throw error;
        }
    }
    async clarify(id, dto) {
        const task = await this.prisma.task.findUnique({
            where: { id },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        if (task.status !== client_1.TaskStatus.needs_clarification) {
            throw new common_1.BadRequestException(`Task is not in needs_clarification status. Current status: ${task.status}`);
        }
        await this.prisma.task.update({
            where: { id },
            data: {
                clarificationAnswers: dto.answers,
                isClarified: true,
            },
        });
        await this.logEvent(id, 'clarification_received', { answers: dto.answers });
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
            await this.prisma.task.update({
                where: { id },
                data: {
                    llmAnalysis: analysis,
                    llmSummary: analysis.summary,
                    taskType: analysis.task_type,
                    recommendedAgent: analysis.recommended_agent,
                    likelyFiles: analysis.likely_files,
                    suggestedCriteria: analysis.suggested_acceptance_criteria,
                },
            });
            return await this.dispatchTask(id, analysis);
        }
        catch (error) {
            this.validateTransition(task.status, client_1.TaskStatus.failed);
            await this.prisma.task.update({
                where: { id },
                data: {
                    status: client_1.TaskStatus.failed,
                    errorMessage: error.message,
                },
            });
            await this.logEvent(id, 'failed', { error: error.message });
            throw error;
        }
    }
    async dispatchTask(taskId, analysis) {
        const task = await this.prisma.task.findUnique({
            where: { id: taskId },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        this.validateTransition(task.status, client_1.TaskStatus.dispatched);
        const issue = await this.githubService.createIssue({
            id: task.id,
            description: task.description,
            repo: task.repo ?? 'mothership/unknown',
            acceptance_criteria: task.acceptanceCriteria ?? undefined,
            clarificationQuestions: task.clarificationQuestions ?? undefined,
            clarificationAnswers: task.clarificationAnswers ?? undefined,
        }, analysis);
        const updatedTask = await this.prisma.task.update({
            where: { id: taskId },
            data: {
                status: client_1.TaskStatus.dispatched,
                githubIssueNumber: issue.issueNumber,
                githubIssueUrl: issue.htmlUrl,
                dispatchedAt: new Date(),
            },
        });
        await this.logEvent(taskId, 'dispatched', {
            issueNumber: issue.issueNumber,
            issueUrl: issue.htmlUrl,
        });
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
    async findAll(query) {
        const { page = 1, limit = 20, status, repo } = query;
        const skip = (page - 1) * limit;
        const where = {};
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
    async findOne(id) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: {
                events: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        return task;
    }
    async retry(id) {
        const task = await this.prisma.task.findUnique({
            where: { id },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        if (task.status !== client_1.TaskStatus.failed) {
            throw new common_1.BadRequestException('Only failed tasks can be retried');
        }
        this.validateTransition(task.status, client_1.TaskStatus.received);
        await this.prisma.task.update({
            where: { id },
            data: {
                status: client_1.TaskStatus.received,
                errorMessage: null,
            },
        });
        await this.logEvent(id, 'retry_requested');
        return this.create({
            description: task.description,
            type: task.taskTypeHint ?? undefined,
            repo: task.repo ?? undefined,
            files: task.filesHint ?? undefined,
            acceptanceCriteria: task.acceptanceCriteria ?? undefined,
            priority: task.priority ?? undefined,
            source: task.source ?? undefined,
            createdBy: task.createdBy ?? undefined,
        });
    }
    async cancel(id) {
        const task = await this.prisma.task.findUnique({
            where: { id },
        });
        if (!task) {
            throw new common_1.NotFoundException('Task not found');
        }
        const cancellableStatuses = [
            client_1.TaskStatus.received,
            client_1.TaskStatus.analyzing,
            client_1.TaskStatus.needs_clarification,
        ];
        if (!cancellableStatuses.includes(task.status)) {
            throw new common_1.BadRequestException(`Cannot cancel task in status: ${task.status}`);
        }
        await this.prisma.task.delete({
            where: { id },
        });
        await this.logEvent(id, 'cancelled');
        return { message: 'Task cancelled successfully' };
    }
    async getHealth() {
        try {
            await this.prisma.$queryRaw `SELECT 1`;
            return { status: 'ok', db: 'connected' };
        }
        catch (error) {
            return { status: 'error', db: 'disconnected', error: error.message };
        }
    }
};
exports.TasksService = TasksService;
exports.TasksService = TasksService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)('ILlmService')),
    __param(2, (0, common_1.Inject)('IGitHubService')),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)('SlackNotificationService')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, Object, Object, Object])
], TasksService);
//# sourceMappingURL=tasks.service.js.map