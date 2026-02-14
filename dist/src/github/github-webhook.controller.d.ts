import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SlackNotificationService } from '../slack/slack-notification.service';
interface WebhookPayload {
    action?: string;
    pull_request?: {
        number: number;
        html_url: string;
        merged: boolean;
        state: string;
        user: {
            login: string;
        };
        body?: string;
    };
    issue?: {
        number: number;
        html_url: string;
    };
    comment?: {
        body: string;
        user: {
            login: string;
        };
    };
    repository?: {
        full_name: string;
    };
}
export declare class GitHubWebhookController {
    private readonly configService;
    private readonly prisma;
    private readonly slackNotificationService;
    private readonly logger;
    private readonly webhookSecret;
    constructor(configService: ConfigService, prisma: PrismaService, slackNotificationService: SlackNotificationService);
    handleGitHubWebhook(signature: string, event: string, payload: WebhookPayload): Promise<{
        status: string;
    }>;
    private handlePullRequestEvent;
    private handlePROpened;
    private handlePRMerged;
    private handlePRClosed;
    private extractIssueNumberFromPRBody;
    private handleIssueCommentEvent;
    private handleIssuesEvent;
    verifyWebhookSignature(payload: string, signature: string): boolean;
}
export {};
