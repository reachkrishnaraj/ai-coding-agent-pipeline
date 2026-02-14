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
import { PrismaService } from '../prisma/prisma.service';
import { SlackNotificationService } from '../slack/slack-notification.service';
import { TaskStatus } from '@prisma/client';
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

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly slackNotificationService: SlackNotificationService,
  ) {
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
    const { action, pull_request, repository } = payload;

    if (!pull_request) {
      return;
    }

    this.logger.log(
      `PR #${pull_request.number} ${action} by ${pull_request.user.login}`,
    );

    // Find task by extracting issue number from PR body
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
        } else {
          await this.handlePRClosed(task, pull_request);
        }
        break;

      default:
        this.logger.debug(`Ignoring PR action: ${action}`);
    }
  }

  private async handlePROpened(task: any, pullRequest: any) {
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.pr_open,
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

    // Send Slack notification
    await this.slackNotificationService.notifyPROpened(task.id);
  }

  private async handlePRMerged(task: any, pullRequest: any) {
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.merged,
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

    // Send Slack notification
    await this.slackNotificationService.notifyPRMerged(task.id);
  }

  private async handlePRClosed(task: any, pullRequest: any) {
    await this.prisma.task.update({
      where: { id: task.id },
      data: {
        status: TaskStatus.failed,
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

    // Send Slack notification
    await this.slackNotificationService.notifyPRClosed(task.id);
  }

  /**
   * Extract issue number from PR body
   * Looks for patterns like "Closes #123", "Fixes #123", etc.
   */
  private extractIssueNumberFromPRBody(body?: string): number | null {
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

  /**
   * Handle issue comment events (agent asking questions)
   */
  private async handleIssueCommentEvent(payload: WebhookPayload) {
    const { action, issue, comment, repository } = payload;

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

      // Find task by issue number
      const task = await this.prisma.task.findFirst({
        where: {
          githubIssueNumber: issue.number,
          repo: repository?.full_name,
        },
      });

      if (task) {
        // Log event
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

        // Send Slack notification
        await this.slackNotificationService.notifyAgentQuestion(task.id);
      }
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
