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
var GitHubWebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubWebhookController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const slack_notification_service_1 = require("../slack/slack-notification.service");
const client_1 = require("@prisma/client");
const crypto = __importStar(require("crypto"));
let GitHubWebhookController = GitHubWebhookController_1 = class GitHubWebhookController {
    configService;
    prisma;
    slackNotificationService;
    logger = new common_1.Logger(GitHubWebhookController_1.name);
    webhookSecret;
    constructor(configService, prisma, slackNotificationService) {
        this.configService = configService;
        this.prisma = prisma;
        this.slackNotificationService = slackNotificationService;
        this.webhookSecret =
            this.configService.get('GITHUB_WEBHOOK_SECRET') || '';
    }
    async handleGitHubWebhook(signature, event, payload) {
        if (!this.verifyWebhookSignature(JSON.stringify(payload), signature)) {
            this.logger.warn('Invalid webhook signature received');
            throw new common_1.UnauthorizedException('Invalid webhook signature');
        }
        this.logger.log(`Received GitHub webhook event: ${event}`);
        try {
            switch (event) {
                case 'pull_request':
                    await this.handlePullRequestEvent(payload);
                    break;
                case 'issue_comment':
                    await this.handleIssueCommentEvent(payload);
                    break;
                case 'issues':
                    await this.handleIssuesEvent(payload);
                    break;
                default:
                    this.logger.debug(`Ignoring event type: ${event}`);
            }
            return { status: 'ok' };
        }
        catch (error) {
            this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
            throw new common_1.BadRequestException('Failed to process webhook');
        }
    }
    async handlePullRequestEvent(payload) {
        const { action, pull_request, repository } = payload;
        if (!pull_request) {
            return;
        }
        this.logger.log(`PR #${pull_request.number} ${action} by ${pull_request.user.login}`);
        const issueNumber = this.extractIssueNumberFromPRBody(pull_request.body);
        if (!issueNumber) {
            this.logger.debug('No issue reference found in PR body');
            return;
        }
        const task = await this.prisma.task.findFirst({
            where: {
                githubIssueNumber: issueNumber,
                repo: repository?.full_name,
            },
        });
        if (!task) {
            this.logger.warn(`No task found for issue #${issueNumber}`);
            return;
        }
        switch (action) {
            case 'opened':
                await this.handlePROpened(task, pull_request);
                break;
            case 'closed':
                if (pull_request.merged) {
                    await this.handlePRMerged(task, pull_request);
                }
                else {
                    await this.handlePRClosed(task, pull_request);
                }
                break;
            default:
                this.logger.debug(`Ignoring PR action: ${action}`);
        }
    }
    async handlePROpened(task, pullRequest) {
        await this.prisma.task.update({
            where: { id: task.id },
            data: {
                status: client_1.TaskStatus.pr_open,
                githubPrNumber: pullRequest.number,
                githubPrUrl: pullRequest.html_url,
                githubPrStatus: 'open',
            },
        });
        await this.prisma.taskEvent.create({
            data: {
                taskId: task.id,
                eventType: 'pr_opened',
                payload: {
                    prNumber: pullRequest.number,
                    prUrl: pullRequest.html_url,
                },
            },
        });
        this.logger.log(`Task ${task.id} updated to pr_open`);
        await this.slackNotificationService.notifyPROpened(task.id);
    }
    async handlePRMerged(task, pullRequest) {
        await this.prisma.task.update({
            where: { id: task.id },
            data: {
                status: client_1.TaskStatus.merged,
                githubPrStatus: 'merged',
                completedAt: new Date(),
            },
        });
        await this.prisma.taskEvent.create({
            data: {
                taskId: task.id,
                eventType: 'pr_merged',
                payload: {
                    prNumber: pullRequest.number,
                    prUrl: pullRequest.html_url,
                },
            },
        });
        this.logger.log(`Task ${task.id} completed and merged`);
        await this.slackNotificationService.notifyPRMerged(task.id);
    }
    async handlePRClosed(task, pullRequest) {
        await this.prisma.task.update({
            where: { id: task.id },
            data: {
                status: client_1.TaskStatus.failed,
                githubPrStatus: 'closed',
            },
        });
        await this.prisma.taskEvent.create({
            data: {
                taskId: task.id,
                eventType: 'pr_closed',
                payload: {
                    prNumber: pullRequest.number,
                    prUrl: pullRequest.html_url,
                },
            },
        });
        this.logger.log(`Task ${task.id} failed - PR closed without merge`);
        await this.slackNotificationService.notifyPRClosed(task.id);
    }
    extractIssueNumberFromPRBody(body) {
        if (!body) {
            return null;
        }
        const patterns = [
            /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/i,
            /#(\d+)/,
        ];
        for (const pattern of patterns) {
            const match = body.match(pattern);
            if (match) {
                return parseInt(match[1], 10);
            }
        }
        return null;
    }
    async handleIssueCommentEvent(payload) {
        const { action, issue, comment, repository } = payload;
        if (!issue || !comment || action !== 'created') {
            return;
        }
        const isBotComment = comment.user.login.includes('bot') ||
            comment.user.login.includes('github-actions');
        if (isBotComment) {
            this.logger.log(`Agent comment on issue #${issue.number}: ${comment.body.slice(0, 50)}...`);
            const task = await this.prisma.task.findFirst({
                where: {
                    githubIssueNumber: issue.number,
                    repo: repository?.full_name,
                },
            });
            if (task) {
                await this.prisma.taskEvent.create({
                    data: {
                        taskId: task.id,
                        eventType: 'agent_question',
                        payload: {
                            comment: comment.body,
                            issueUrl: issue.html_url,
                        },
                    },
                });
                await this.slackNotificationService.notifyAgentQuestion(task.id);
            }
        }
    }
    async handleIssuesEvent(payload) {
        const { action, issue } = payload;
        if (!issue) {
            return;
        }
        this.logger.debug(`Issue #${issue.number} ${action}`);
    }
    verifyWebhookSignature(payload, signature) {
        if (!this.webhookSecret) {
            this.logger.warn('GITHUB_WEBHOOK_SECRET not configured, skipping signature verification');
            return true;
        }
        if (!signature) {
            return false;
        }
        const hmac = crypto.createHmac('sha256', this.webhookSecret);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');
        try {
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
        }
        catch {
            return false;
        }
    }
};
exports.GitHubWebhookController = GitHubWebhookController;
__decorate([
    (0, common_1.Post)('github'),
    __param(0, (0, common_1.Headers)('x-hub-signature-256')),
    __param(1, (0, common_1.Headers)('x-github-event')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], GitHubWebhookController.prototype, "handleGitHubWebhook", null);
exports.GitHubWebhookController = GitHubWebhookController = GitHubWebhookController_1 = __decorate([
    (0, common_1.Controller)('api/webhooks'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        slack_notification_service_1.SlackNotificationService])
], GitHubWebhookController);
//# sourceMappingURL=github-webhook.controller.js.map