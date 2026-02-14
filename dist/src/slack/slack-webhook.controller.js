"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SlackWebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackWebhookController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const slack_service_1 = require("./slack.service");
const tasks_service_1 = require("../tasks/tasks.service");
const crypto = __importStar(require("crypto"));
let SlackWebhookController = SlackWebhookController_1 = class SlackWebhookController {
    slackService;
    tasksService;
    configService;
    logger = new common_1.Logger(SlackWebhookController_1.name);
    constructor(slackService, tasksService, configService) {
        this.slackService = slackService;
        this.tasksService = tasksService;
        this.configService = configService;
    }
    async handleWebhook(body, signature, timestamp) {
        if (!this.verifySlackSignature(JSON.stringify(body), signature, timestamp)) {
            this.logger.warn('Invalid Slack signature');
            throw new common_1.BadRequestException('Invalid signature');
        }
        if (body.type === 'url_verification') {
            return { challenge: body.challenge };
        }
        if (body.command === '/ai-task') {
            return this.handleSlashCommand(body);
        }
        if (body.type === 'event_callback') {
            setImmediate(() => this.handleEvent(body));
            return { ok: true };
        }
        this.logger.warn(`Unknown Slack webhook payload type: ${body.type}`);
        return { ok: true };
    }
    async handleSlashCommand(payload) {
        const description = payload.text.trim();
        if (!description) {
            return {
                text: 'Please provide a task description. Usage: `/ai-task Fix the payment status bug`',
                response_type: 'ephemeral',
            };
        }
        try {
            const task = await this.tasksService.create({
                description,
                source: 'slack',
                createdBy: payload.user_id,
                repo: this.configService.get('DEFAULT_REPO') || 'mothership/finance-service',
            });
            await this.tasksService['prisma'].task.update({
                where: { id: task.id },
                data: {
                    slackUserId: payload.user_id,
                    slackChannelId: payload.channel_id,
                },
            });
            if (task.status === 'needs_clarification') {
                const questions = task.clarificationQuestions || [];
                const threadTs = await this.slackService.sendClarificationQuestions(payload.user_id, task.id, questions);
                if (threadTs) {
                    await this.tasksService['prisma'].task.update({
                        where: { id: task.id },
                        data: { slackThreadTs: threadTs },
                    });
                }
                return {
                    text: "Analyzing your task... I've sent you a DM with some questions.",
                    response_type: 'ephemeral',
                };
            }
            return {
                text: `Task dispatched to ${task['agent'] || 'AI agent'}. Issue: ${task['issue_url']}`,
                response_type: 'ephemeral',
            };
        }
        catch (error) {
            this.logger.error(`Failed to handle slash command: ${error.message}`, error.stack);
            return {
                text: `Error creating task: ${error.message}`,
                response_type: 'ephemeral',
            };
        }
    }
    async handleEvent(payload) {
        const event = payload.event;
        if (!event) {
            return;
        }
        if (event.type === 'message' && event.channel_type === 'im') {
            if (event.bot_id || event.subtype) {
                return;
            }
            if (event.thread_ts) {
                await this.handleThreadReply(event);
            }
        }
    }
    async handleThreadReply(event) {
        try {
            const threadTs = event.thread_ts;
            const answerText = event.text;
            const task = await this.tasksService['prisma'].task.findFirst({
                where: {
                    slackThreadTs: threadTs,
                    status: 'needs_clarification',
                },
            });
            if (!task) {
                this.logger.warn(`No task found for thread_ts: ${threadTs}`);
                return;
            }
            const questions = task.clarificationQuestions || [];
            const answers = this.parseAnswersFromText(answerText, questions.length);
            const result = await this.tasksService.clarify(task.id, { answers });
            await this.slackService.sendThreadReply(event.channel, threadTs, `Got it! Task dispatched to ${result['agent'] || 'AI agent'}.\n\nIssue: ${result['issue_url']}`);
        }
        catch (error) {
            this.logger.error(`Failed to handle thread reply: ${error.message}`, error.stack);
            if (event.channel && event.thread_ts) {
                await this.slackService.sendThreadReply(event.channel, event.thread_ts, `Sorry, I couldn't process your answers: ${error.message}`);
            }
        }
    }
    parseAnswersFromText(text, expectedCount) {
        const numberedPattern = /^\d+\.\s*(.+)$/gm;
        const numberedMatches = [...text.matchAll(numberedPattern)];
        if (numberedMatches.length === expectedCount) {
            return numberedMatches.map(match => match[1].trim());
        }
        const lines = text
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        if (lines.length === expectedCount) {
            return lines;
        }
        if (expectedCount === 1) {
            return [text.trim()];
        }
        return lines.slice(0, expectedCount);
    }
    verifySlackSignature(body, signature, timestamp) {
        const signingSecret = this.configService.get('SLACK_SIGNING_SECRET');
        if (!signingSecret) {
            this.logger.warn('SLACK_SIGNING_SECRET not configured. Skipping signature verification.');
            return true;
        }
        if (!signature || !timestamp) {
            return false;
        }
        const now = Math.floor(Date.now() / 1000);
        const requestTime = parseInt(timestamp, 10);
        if (Math.abs(now - requestTime) > 60 * 5) {
            this.logger.warn('Slack request timestamp too old');
            return false;
        }
        const sigBasestring = `v0:${timestamp}:${body}`;
        const hmac = crypto
            .createHmac('sha256', signingSecret)
            .update(sigBasestring)
            .digest('hex');
        const computedSignature = `v0=${hmac}`;
        return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(signature));
    }
};
exports.SlackWebhookController = SlackWebhookController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-slack-signature')),
    __param(2, (0, common_1.Headers)('x-slack-request-timestamp')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], SlackWebhookController.prototype, "handleWebhook", null);
exports.SlackWebhookController = SlackWebhookController = SlackWebhookController_1 = __decorate([
    (0, common_1.Controller)('api/webhooks/slack'),
    __metadata("design:paramtypes", [slack_service_1.SlackService,
        tasks_service_1.TasksService,
        config_1.ConfigService])
], SlackWebhookController);
//# sourceMappingURL=slack-webhook.controller.js.map