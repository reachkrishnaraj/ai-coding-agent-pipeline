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
var SlackService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const web_api_1 = require("@slack/web-api");
let SlackService = SlackService_1 = class SlackService {
    configService;
    logger = new common_1.Logger(SlackService_1.name);
    client;
    constructor(configService) {
        this.configService = configService;
        const token = this.configService.get('SLACK_BOT_TOKEN');
        if (!token) {
            this.logger.warn('SLACK_BOT_TOKEN not configured. Slack features will be disabled.');
        }
        this.client = new web_api_1.WebClient(token);
    }
    async sendDM(slackUserId, text) {
        try {
            if (!this.configService.get('SLACK_BOT_TOKEN')) {
                this.logger.warn('Cannot send DM: SLACK_BOT_TOKEN not configured');
                return null;
            }
            const result = await this.client.chat.postMessage({
                channel: slackUserId,
                text,
                mrkdwn: true,
            });
            return result.ts;
        }
        catch (error) {
            this.logger.error(`Failed to send DM to ${slackUserId}: ${error.message}`, error.stack);
            return null;
        }
    }
    async sendThreadReply(channel, threadTs, text) {
        try {
            if (!this.configService.get('SLACK_BOT_TOKEN')) {
                this.logger.warn('Cannot send thread reply: SLACK_BOT_TOKEN not configured');
                return;
            }
            await this.client.chat.postMessage({
                channel,
                thread_ts: threadTs,
                text,
                mrkdwn: true,
            });
        }
        catch (error) {
            this.logger.error(`Failed to send thread reply to ${channel}/${threadTs}: ${error.message}`, error.stack);
        }
    }
    async sendTaskNotification(task, eventType) {
        try {
            if (!this.configService.get('SLACK_BOT_TOKEN')) {
                this.logger.warn('Cannot send notification: SLACK_BOT_TOKEN not configured');
                return;
            }
            const slackUserId = task.slackUserId ||
                this.configService.get('SLACK_DEFAULT_USER_ID');
            if (!slackUserId) {
                this.logger.warn('No Slack user ID found for notification');
                return;
            }
            let message;
            switch (eventType) {
                case 'dispatched':
                    message = this.formatDispatchedMessage(task);
                    break;
                case 'pr_opened':
                    message = this.formatPrOpenedMessage(task);
                    break;
                case 'pr_merged':
                    message = this.formatPrMergedMessage(task);
                    break;
                case 'pr_closed':
                    message = this.formatPrClosedMessage(task);
                    break;
                case 'agent_question':
                    message = this.formatAgentQuestionMessage(task);
                    break;
                case 'clarification_sent':
                    message = this.formatClarificationMessage(task);
                    break;
                default:
                    this.logger.warn(`Unknown event type for notification: ${eventType}`);
                    return;
            }
            await this.sendDM(slackUserId, message);
        }
        catch (error) {
            this.logger.error(`Failed to send task notification: ${error.message}`, error.stack);
        }
    }
    async sendClarificationQuestions(slackUserId, taskId, questions) {
        try {
            if (!this.configService.get('SLACK_BOT_TOKEN')) {
                this.logger.warn('Cannot send clarification questions: SLACK_BOT_TOKEN not configured');
                return null;
            }
            const message = this.formatClarificationQuestionsMessage(taskId, questions);
            return await this.sendDM(slackUserId, message);
        }
        catch (error) {
            this.logger.error(`Failed to send clarification questions: ${error.message}`, error.stack);
            return null;
        }
    }
    formatDispatchedMessage(task) {
        const agent = task.recommendedAgent || 'AI agent';
        return `*Task dispatched to ${agent}*\n\n` +
            `Task: ${task.llmSummary || task.description}\n` +
            `Issue: ${task.githubIssueUrl || 'Creating...'}`;
    }
    formatPrOpenedMessage(task) {
        return `*PR ready for review*\n\n` +
            `Task: ${task.llmSummary || task.description}\n` +
            `PR: ${task.githubPrUrl}`;
    }
    formatPrMergedMessage(task) {
        return `*Done! PR has been merged.*\n\n` +
            `Task: ${task.llmSummary || task.description}\n` +
            `PR: ${task.githubPrUrl}`;
    }
    formatPrClosedMessage(task) {
        return `*PR needs attention*\n\n` +
            `Task: ${task.llmSummary || task.description}\n` +
            `PR: ${task.githubPrUrl}\n\n` +
            `The PR was closed without merging. Please review.`;
    }
    formatAgentQuestionMessage(task) {
        return `*The agent has a question about your task*\n\n` +
            `Task: ${task.llmSummary || task.description}\n` +
            `Please check the GitHub issue for details.`;
    }
    formatClarificationMessage(task) {
        const questions = task.clarificationQuestions;
        return `*I need some clarification before creating the task*\n\n` +
            questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
            '\n\nPlease reply in this thread with your answers.';
    }
    formatClarificationQuestionsMessage(taskId, questions) {
        return `*I need some clarification before dispatching your task*\n\n` +
            questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
            '\n\n_Please reply to this thread with your answers (one message is fine)._';
    }
};
exports.SlackService = SlackService;
exports.SlackService = SlackService = SlackService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SlackService);
//# sourceMappingURL=slack.service.js.map