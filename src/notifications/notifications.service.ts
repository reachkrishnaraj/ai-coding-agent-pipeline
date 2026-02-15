import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { NotificationPreference } from '../common/schemas/notification-preference.schema';
import { NotificationLog } from '../common/schemas/notification-log.schema';
import { EmailService } from './email.service';
import { SlackService } from '../slack/slack.service';

interface NotificationPayload {
  taskId?: string;
  description?: string;
  summary?: string;
  repo?: string;
  agent?: string;
  issueNumber?: number;
  issueUrl?: string;
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;
  errorMessage?: string;
  errorType?: string;
  questions?: string[];
  [key: string]: any;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(NotificationPreference.name)
    private notificationPreferenceModel: Model<NotificationPreference>,
    @InjectModel(NotificationLog.name)
    private notificationLogModel: Model<NotificationLog>,
    private readonly emailService: EmailService,
    private readonly slackService: SlackService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send notification based on event type
   */
  async sendNotification(
    userId: string,
    eventType: string,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      // Get user preferences
      const prefs = await this.getOrCreatePreferences(userId);

      // Check if event is enabled
      if (!prefs.eventPreferences[eventType]) {
        this.logger.debug(
          `Event ${eventType} disabled for user ${userId}, skipping notification`,
        );
        return;
      }

      // Check if user is unsubscribed
      if (prefs.unsubscribed.email && prefs.unsubscribed.slackDm) {
        this.logger.debug(`User ${userId} is unsubscribed from all channels`);
        return;
      }

      // Check quiet hours
      const isUrgent = this.isUrgentEvent(eventType);
      if (this.isInQuietHours(prefs) && !isUrgent) {
        this.logger.debug(
          `User ${userId} is in quiet hours, skipping non-urgent notification`,
        );
        // In a production system, queue this notification for later
        return;
      }

      // Send to enabled channels
      const promises: Promise<void>[] = [];

      if (prefs.channels.email.enabled && !prefs.unsubscribed.email) {
        promises.push(this.sendEmailNotification(prefs, eventType, payload));
      }

      if (prefs.channels.slack_dm.enabled && !prefs.unsubscribed.slackDm) {
        promises.push(this.sendSlackDMNotification(prefs, eventType, payload));
      }

      if (prefs.channels.slack_channel.enabled && !prefs.unsubscribed.slackChannel) {
        promises.push(this.sendSlackChannelNotification(prefs, eventType, payload));
      }

      await Promise.all(promises);
    } catch (error) {
      this.logger.error(
        `Failed to send notification to ${userId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    prefs: NotificationPreference,
    eventType: string,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const { subject, html } = this.buildEmailContent(
        eventType,
        payload,
        prefs.unsubscribeToken,
      );

      const result = await this.emailService.sendEmail({
        to: prefs.channels.email.address,
        subject,
        html,
        headers: {
          'List-Unsubscribe': `<${this.getAppUrl()}/api/notifications/preferences/unsubscribe/${prefs.unsubscribeToken}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await this.logNotification({
        taskId: payload.taskId,
        userId: prefs.userId,
        channel: 'email',
        eventType,
        recipient: prefs.channels.email.address,
        subject,
        status: result.success ? 'sent' : 'failed',
        messageId: result.messageId,
        error: result.error,
        metadata: {
          provider: 'nodemailer',
          attempts: 1,
          lastAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${prefs.userId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send Slack DM notification
   */
  private async sendSlackDMNotification(
    prefs: NotificationPreference,
    eventType: string,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const slackUserId = prefs.channels.slack_dm.slackUserId;
      if (!slackUserId) {
        this.logger.warn(
          `No Slack user ID for ${prefs.userId}, skipping Slack DM`,
        );
        return;
      }

      const message = this.buildSlackMessage(eventType, payload);
      const messageTs = await this.slackService.sendDM(slackUserId, message);

      await this.logNotification({
        taskId: payload.taskId,
        userId: prefs.userId,
        channel: 'slack_dm',
        eventType,
        recipient: slackUserId,
        status: messageTs ? 'sent' : 'failed',
        messageId: messageTs || undefined,
        metadata: {
          provider: 'slack',
          attempts: 1,
          lastAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send Slack DM to ${prefs.userId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Send Slack channel notification
   */
  private async sendSlackChannelNotification(
    prefs: NotificationPreference,
    eventType: string,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const channelId = prefs.channels.slack_channel.channelId;
      if (!channelId) {
        this.logger.warn(
          `No Slack channel ID for ${prefs.userId}, skipping channel notification`,
        );
        return;
      }

      // Check if this event type should be posted to channel
      const eventTypesOnly = prefs.channels.slack_channel.eventTypesOnly;
      if (eventTypesOnly && eventTypesOnly.length > 0) {
        if (!eventTypesOnly.includes(eventType)) {
          this.logger.debug(
            `Event ${eventType} not in channel whitelist for ${prefs.userId}`,
          );
          return;
        }
      }

      const message = this.buildSlackMessage(eventType, payload);
      // Note: SlackService doesn't have postToChannel yet, would need to add it
      // For now, we'll log that this would be sent
      this.logger.debug(
        `Would send to Slack channel ${channelId}: ${message}`,
      );

      await this.logNotification({
        taskId: payload.taskId,
        userId: prefs.userId,
        channel: 'slack_channel',
        eventType,
        recipient: channelId,
        status: 'sent',
        metadata: {
          provider: 'slack',
          attempts: 1,
          lastAttempt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send Slack channel notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Build email content based on event type
   */
  private buildEmailContent(
    eventType: string,
    payload: NotificationPayload,
    unsubscribeToken: string,
  ): { subject: string; html: string } {
    const appUrl = this.getAppUrl();
    const unsubscribeUrl = `${appUrl}/api/notifications/preferences/unsubscribe/${unsubscribeToken}`;
    const settingsUrl = `${appUrl}/settings/notifications`;
    const taskUrl = payload.taskId ? `${appUrl}/tasks/${payload.taskId}` : appUrl;

    let subject = '';
    let body = '';

    switch (eventType) {
      case 'task_created':
        subject = `[AI Pipeline] New task: ${payload.summary || payload.description}`;
        body = `
          <h2>Task Created</h2>
          <p>Your new AI coding task has been submitted and is being analyzed.</p>
          <p><strong>Task:</strong> ${payload.description}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>Status:</strong> Analyzing...</p>
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'task_clarification_needed':
        subject = `[AI Pipeline] Clarification needed for your task`;
        body = `
          <h2>Clarification Needed</h2>
          <p>Before we can dispatch your task, we need some clarification.</p>
          <p><strong>Task:</strong> ${payload.description}</p>
          <p><strong>Questions:</strong></p>
          <ol>
            ${(payload.questions || []).map((q) => `<li>${q}</li>`).join('')}
          </ol>
          <p><a href="${taskUrl}">Answer Questions</a></p>
        `;
        break;

      case 'task_dispatched':
        subject = `[AI Pipeline] Task dispatched to ${payload.agent}`;
        body = `
          <h2>Task Dispatched</h2>
          <p>Your task has been analyzed and assigned to an AI agent.</p>
          <p><strong>Task:</strong> ${payload.summary}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>Agent:</strong> ${payload.agent}</p>
          ${payload.issueUrl ? `<p><a href="${payload.issueUrl}">View GitHub Issue</a></p>` : ''}
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'pr_opened':
        subject = `[AI Pipeline] PR ready for review: ${payload.prTitle || payload.summary}`;
        body = `
          <h2>Pull Request Ready</h2>
          <p>A pull request has been opened and is ready for review.</p>
          <p><strong>Task:</strong> ${payload.summary}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>PR:</strong> #${payload.prNumber}</p>
          ${payload.prUrl ? `<p><a href="${payload.prUrl}">Review PR</a></p>` : ''}
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'pr_merged':
        subject = `[AI Pipeline] Task complete! PR merged`;
        body = `
          <h2>Task Complete</h2>
          <p>Your task has been successfully completed and merged!</p>
          <p><strong>Task:</strong> ${payload.summary}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>PR:</strong> #${payload.prNumber}</p>
          ${payload.prUrl ? `<p><a href="${payload.prUrl}">View PR</a></p>` : ''}
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'pr_closed':
        subject = `[AI Pipeline] PR needs attention`;
        body = `
          <h2>PR Needs Attention</h2>
          <p>The pull request was closed without merging.</p>
          <p><strong>Task:</strong> ${payload.summary}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>PR:</strong> #${payload.prNumber}</p>
          ${payload.prUrl ? `<p><a href="${payload.prUrl}">View PR</a></p>` : ''}
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'task_failed':
        subject = `[AI Pipeline] Task failed: ${payload.errorType}`;
        body = `
          <h2>Task Failed</h2>
          <p>Your task encountered an error and needs attention.</p>
          <p><strong>Task:</strong> ${payload.description}</p>
          <p><strong>Repository:</strong> ${payload.repo}</p>
          <p><strong>Error:</strong> ${payload.errorMessage}</p>
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      case 'agent_question':
        subject = `[AI Pipeline] Agent has a question`;
        body = `
          <h2>Agent Question</h2>
          <p>The agent working on your task has a question.</p>
          <p><strong>Task:</strong> ${payload.summary}</p>
          ${payload.issueUrl ? `<p><a href="${payload.issueUrl}">View Question on GitHub</a></p>` : ''}
          <p><a href="${taskUrl}">View Task</a></p>
        `;
        break;

      default:
        subject = `[AI Pipeline] Task Update`;
        body = `
          <h2>Task Update</h2>
          <p>There's an update on your task.</p>
          <p><a href="${taskUrl}">View Task</a></p>
        `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          h2 { color: #2563eb; }
          a { color: #2563eb; text-decoration: none; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        ${body}
        <div class="footer">
          <p>
            <a href="${settingsUrl}">Manage notifications</a> |
            <a href="${unsubscribeUrl}">Unsubscribe</a>
          </p>
          <p>&copy; 2026 AI Pipeline. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    return { subject, html };
  }

  /**
   * Build Slack message based on event type
   */
  private buildSlackMessage(
    eventType: string,
    payload: NotificationPayload,
  ): string {
    const appUrl = this.getAppUrl();
    const taskUrl = payload.taskId ? `${appUrl}/tasks/${payload.taskId}` : appUrl;

    switch (eventType) {
      case 'task_created':
        return `*New Task Created*\n\nTask: ${payload.description}\nRepo: ${payload.repo}\nStatus: Analyzing...\n\n<${taskUrl}|View Task>`;

      case 'task_clarification_needed':
        const questions = (payload.questions || [])
          .map((q, i) => `${i + 1}. ${q}`)
          .join('\n');
        return `*Clarification Needed*\n\nTask: ${payload.description}\n\nQuestions:\n${questions}\n\n<${taskUrl}|Answer Questions>`;

      case 'task_dispatched':
        return `*Task Dispatched*\n\nTask: ${payload.summary}\nRepo: ${payload.repo}\nAgent: ${payload.agent}\n\n${payload.issueUrl ? `<${payload.issueUrl}|View Issue>` : ''} <${taskUrl}|View Task>`;

      case 'pr_opened':
        return `*PR Ready for Review*\n\nTask: ${payload.summary}\nRepo: ${payload.repo}\nPR: #${payload.prNumber}\n\n${payload.prUrl ? `<${payload.prUrl}|Review PR>` : ''} <${taskUrl}|View Task>`;

      case 'pr_merged':
        return `*Task Complete!*\n\nTask: ${payload.summary}\nRepo: ${payload.repo}\nPR: #${payload.prNumber} merged\n\n${payload.prUrl ? `<${payload.prUrl}|View PR>` : ''} <${taskUrl}|View Task>`;

      case 'pr_closed':
        return `*PR Needs Attention*\n\nTask: ${payload.summary}\nRepo: ${payload.repo}\nPR: #${payload.prNumber} was closed without merging\n\n${payload.prUrl ? `<${payload.prUrl}|View PR>` : ''} <${taskUrl}|View Task>`;

      case 'task_failed':
        return `*Task Failed*\n\nTask: ${payload.description}\nRepo: ${payload.repo}\nError: ${payload.errorMessage}\n\n<${taskUrl}|View Task>`;

      case 'agent_question':
        return `*Agent Has a Question*\n\nTask: ${payload.summary}\n\n${payload.issueUrl ? `<${payload.issueUrl}|View Question>` : ''} <${taskUrl}|View Task>`;

      default:
        return `*Task Update*\n\n<${taskUrl}|View Task>`;
    }
  }

  /**
   * Get or create notification preferences for a user
   */
  async getOrCreatePreferences(
    userId: string,
  ): Promise<NotificationPreference> {
    let prefs = await this.notificationPreferenceModel.findOne({ userId });

    if (!prefs) {
      prefs = await this.notificationPreferenceModel.create({
        userId,
        email: `${userId}@example.com`, // Would be fetched from GitHub API in production
        channels: {
          email: {
            enabled: true,
            address: `${userId}@example.com`,
            digestMode: 'real-time',
          },
          slack_dm: {
            enabled: true,
          },
          slack_channel: {
            enabled: false,
          },
        },
        quietHours: {
          enabled: false,
          startTime: '18:00',
          endTime: '09:00',
          daysOfWeek: [1, 2, 3, 4, 5],
          bypassForUrgent: true,
        },
        eventPreferences: {
          task_created: false,
          task_clarification_needed: true,
          task_dispatched: true,
          pr_opened: true,
          pr_merged: true,
          pr_closed: true,
          task_failed: true,
          agent_question: true,
          task_clarified: false,
        },
        unsubscribed: {
          email: false,
          slackDm: false,
          slackChannel: false,
        },
        unsubscribeToken: this.generateUnsubscribeToken(userId),
        timezone: 'UTC',
      });
    }

    return prefs;
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<NotificationPreference>,
  ): Promise<NotificationPreference> {
    const prefs = await this.getOrCreatePreferences(userId);

    // Merge updates
    Object.assign(prefs, updates);

    await prefs.save();
    return prefs;
  }

  /**
   * Get notification history for a user or task
   */
  async getNotificationHistory(
    filters: {
      userId?: string;
      taskId?: string;
      status?: string;
      channel?: string;
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
    },
    page: number = 1,
    limit: number = 20,
  ): Promise<{ logs: NotificationLog[]; total: number }> {
    const query: any = {};

    if (filters.userId) query.userId = filters.userId;
    if (filters.taskId) query.taskId = filters.taskId;
    if (filters.status) query.status = filters.status;
    if (filters.channel) query.channel = filters.channel;
    if (filters.eventType) query.eventType = filters.eventType;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = filters.startDate;
      if (filters.endDate) query.createdAt.$lte = filters.endDate;
    }

    const [logs, total] = await Promise.all([
      this.notificationLogModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.notificationLogModel.countDocuments(query),
    ]);

    return { logs, total };
  }

  /**
   * Unsubscribe user via token
   */
  async unsubscribe(
    token: string,
    channel?: 'email' | 'slack_dm' | 'slack_channel',
  ): Promise<NotificationPreference | null> {
    const prefs = await this.notificationPreferenceModel.findOne({
      unsubscribeToken: token,
    });

    if (!prefs) {
      return null;
    }

    if (channel) {
      switch (channel) {
        case 'email':
          prefs.unsubscribed.email = true;
          break;
        case 'slack_dm':
          prefs.unsubscribed.slackDm = true;
          break;
        case 'slack_channel':
          prefs.unsubscribed.slackChannel = true;
          break;
      }
    } else {
      // Unsubscribe from all
      prefs.unsubscribed.email = true;
      prefs.unsubscribed.slackDm = true;
      prefs.unsubscribed.slackChannel = true;
    }

    prefs.unsubscribed.unsubscribedAt = new Date();
    await prefs.save();

    return prefs;
  }

  /**
   * Resubscribe user via token
   */
  async resubscribe(
    token: string,
    channel?: 'email' | 'slack_dm' | 'slack_channel',
  ): Promise<NotificationPreference | null> {
    const prefs = await this.notificationPreferenceModel.findOne({
      unsubscribeToken: token,
    });

    if (!prefs) {
      return null;
    }

    if (channel) {
      switch (channel) {
        case 'email':
          prefs.unsubscribed.email = false;
          break;
        case 'slack_dm':
          prefs.unsubscribed.slackDm = false;
          break;
        case 'slack_channel':
          prefs.unsubscribed.slackChannel = false;
          break;
      }
    } else {
      // Resubscribe to all
      prefs.unsubscribed.email = false;
      prefs.unsubscribed.slackDm = false;
      prefs.unsubscribed.slackChannel = false;
    }

    await prefs.save();
    return prefs;
  }

  /**
   * Helper: Check if event is urgent (bypasses quiet hours)
   */
  private isUrgentEvent(eventType: string): boolean {
    const urgentEvents = [
      'task_clarification_needed',
      'pr_closed',
      'task_failed',
      'agent_question',
    ];
    return urgentEvents.includes(eventType);
  }

  /**
   * Helper: Check if user is currently in quiet hours
   */
  private isInQuietHours(prefs: NotificationPreference): boolean {
    if (!prefs.quietHours.enabled) {
      return false;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();

    // Check if today is in quiet hours days
    if (!prefs.quietHours.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }

    // Parse start and end times
    const [startHour, startMin] = prefs.quietHours.startTime
      .split(':')
      .map(Number);
    const [endHour, endMin] = prefs.quietHours.endTime.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle quiet hours that span midnight
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  /**
   * Helper: Generate unsubscribe token
   */
  private generateUnsubscribeToken(userId: string): string {
    const timestamp = Date.now();
    const randomStr = crypto.randomBytes(32).toString('hex');
    const combined = `${userId}:${timestamp}:${randomStr}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Helper: Log notification
   */
  private async logNotification(log: {
    taskId?: string;
    userId: string;
    channel: 'email' | 'slack_dm' | 'slack_channel';
    eventType: string;
    recipient: string;
    subject?: string;
    status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'unsubscribed';
    messageId?: string;
    error?: string;
    metadata: any;
  }): Promise<void> {
    try {
      await this.notificationLogModel.create(log);
    } catch (error) {
      this.logger.error(
        `Failed to log notification: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Helper: Get app URL
   */
  private getAppUrl(): string {
    return this.configService.get<string>('APP_URL', 'http://localhost:3000');
  }
}
