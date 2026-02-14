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
var SlackNotificationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackNotificationService = void 0;
const common_1 = require("@nestjs/common");
const slack_service_1 = require("./slack.service");
const prisma_service_1 = require("../prisma/prisma.service");
let SlackNotificationService = SlackNotificationService_1 = class SlackNotificationService {
    slackService;
    prisma;
    logger = new common_1.Logger(SlackNotificationService_1.name);
    constructor(slackService, prisma) {
        this.slackService = slackService;
        this.prisma = prisma;
    }
    async notifyTaskDispatched(taskId) {
        try {
            const task = await this.prisma.task.findUnique({
                where: { id: taskId },
            });
            if (!task || !task.slackUserId) {
                return;
            }
            await this.slackService.sendTaskNotification(task, 'dispatched');
        }
        catch (error) {
            this.logger.error(`Failed to notify task dispatched: ${error.message}`);
        }
    }
    async notifyPROpened(taskId) {
        try {
            const task = await this.prisma.task.findUnique({
                where: { id: taskId },
            });
            if (!task || !task.slackUserId) {
                return;
            }
            await this.slackService.sendTaskNotification(task, 'pr_opened');
        }
        catch (error) {
            this.logger.error(`Failed to notify PR opened: ${error.message}`);
        }
    }
    async notifyPRMerged(taskId) {
        try {
            const task = await this.prisma.task.findUnique({
                where: { id: taskId },
            });
            if (!task || !task.slackUserId) {
                return;
            }
            await this.slackService.sendTaskNotification(task, 'pr_merged');
        }
        catch (error) {
            this.logger.error(`Failed to notify PR merged: ${error.message}`);
        }
    }
    async notifyPRClosed(taskId) {
        try {
            const task = await this.prisma.task.findUnique({
                where: { id: taskId },
            });
            if (!task || !task.slackUserId) {
                return;
            }
            await this.slackService.sendTaskNotification(task, 'pr_closed');
        }
        catch (error) {
            this.logger.error(`Failed to notify PR closed: ${error.message}`);
        }
    }
    async notifyAgentQuestion(taskId) {
        try {
            const task = await this.prisma.task.findUnique({
                where: { id: taskId },
            });
            if (!task || !task.slackUserId) {
                return;
            }
            await this.slackService.sendTaskNotification(task, 'agent_question');
        }
        catch (error) {
            this.logger.error(`Failed to notify agent question: ${error.message}`);
        }
    }
};
exports.SlackNotificationService = SlackNotificationService;
exports.SlackNotificationService = SlackNotificationService = SlackNotificationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [slack_service_1.SlackService,
        prisma_service_1.PrismaService])
], SlackNotificationService);
//# sourceMappingURL=slack-notification.service.js.map