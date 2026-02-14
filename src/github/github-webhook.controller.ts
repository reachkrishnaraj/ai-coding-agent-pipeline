import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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

@Controller('api/webhooks')
export class GitHubWebhookController {
  private readonly logger = new Logger(GitHubWebhookController.name);
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret =
      this.configService.get<string>('GITHUB_WEBHOOK_SECRET') || '';
  }

  @Post('github')
  async handleGitHubWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
    @Body() payload: WebhookPayload,
  ) {
    // Verify webhook signature
    if (!this.verifyWebhookSignature(JSON.stringify(payload), signature)) {
      this.logger.warn('Invalid webhook signature received');
      throw new UnauthorizedException('Invalid webhook signature');
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
    } catch (error) {
      this.logger.error(
        `Error handling webhook: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Failed to process webhook');
    }
  }

  /**
   * Handle pull request events (opened, merged, closed)
   */
  private async handlePullRequestEvent(payload: WebhookPayload) {
    const { action, pull_request } = payload;

    if (!pull_request) {
      return;
    }

    this.logger.log(
      `PR #${pull_request.number} ${action} by ${pull_request.user.login}`,
    );

    // TODO: Find task by issue number from PR body
    // TODO: Update task status based on action

    switch (action) {
      case 'opened':
        // Extract issue number from PR body if it references an issue
        // Update task status to 'pr_open'
        this.logger.log(
          `PR opened: ${pull_request.html_url} - would update task status to pr_open`,
        );
        break;

      case 'closed':
        if (pull_request.merged) {
          // Update task status to 'merged'
          this.logger.log(
            `PR merged: ${pull_request.html_url} - would update task status to merged`,
          );
        } else {
          // Update task status to 'failed'
          this.logger.log(
            `PR closed without merge: ${pull_request.html_url} - would update task status to failed`,
          );
        }
        break;

      default:
        this.logger.debug(`Ignoring PR action: ${action}`);
    }
  }

  /**
   * Handle issue comment events (agent asking questions)
   */
  private async handleIssueCommentEvent(payload: WebhookPayload) {
    const { action, issue, comment } = payload;

    if (!issue || !comment || action !== 'created') {
      return;
    }

    // Check if comment is from a bot (agent asking questions)
    const isBotComment =
      comment.user.login.includes('bot') ||
      comment.user.login.includes('github-actions');

    if (isBotComment) {
      this.logger.log(
        `Agent comment on issue #${issue.number}: ${comment.body.slice(0, 50)}...`,
      );
      // TODO: Relay to Slack (will be implemented in Session D)
      // TODO: Log event to task_events
    }
  }

  /**
   * Handle issues events (labeled, etc.)
   */
  private async handleIssuesEvent(payload: WebhookPayload) {
    const { action, issue } = payload;

    if (!issue) {
      return;
    }

    this.logger.debug(`Issue #${issue.number} ${action}`);

    // Could handle 'labeled' event here if needed
    // For now, just log it
  }

  /**
   * Verify GitHub webhook signature using HMAC SHA-256
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'GITHUB_WEBHOOK_SECRET not configured, skipping signature verification',
      );
      return true; // Allow in development
    }

    if (!signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest),
      );
    } catch {
      return false;
    }
  }
}
