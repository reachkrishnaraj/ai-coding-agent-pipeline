import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly client: WebClient;

  constructor(private readonly configService: ConfigService) {
    const token = this.configService.get<string>('SLACK_BOT_TOKEN');
    if (!token) {
      this.logger.warn(
        'SLACK_BOT_TOKEN not configured. Slack features will be disabled.',
      );
    }
    this.client = new WebClient(token);
  }

  /**
   * Send a direct message to a Slack user
   */
  async sendDM(slackUserId: string, text: string): Promise<string | null> {
    try {
      if (!this.configService.get<string>('SLACK_BOT_TOKEN')) {
        this.logger.warn('Cannot send DM: SLACK_BOT_TOKEN not configured');
        return null;
      }

      const result = await this.client.chat.postMessage({
        channel: slackUserId,
        text,
        mrkdwn: true,
      });

      return result.ts as string;
    } catch (error) {
      this.logger.error(
        `Failed to send DM to ${slackUserId}: ${error.message}`,
        error.stack,
      );
      // Slack is non-blocking: log warning and continue
      return null;
    }
  }

  /**
   * Send a reply in a thread
   */
  async sendThreadReply(
    channel: string,
    threadTs: string,
    text: string,
  ): Promise<void> {
    try {
      if (!this.configService.get<string>('SLACK_BOT_TOKEN')) {
        this.logger.warn(
          'Cannot send thread reply: SLACK_BOT_TOKEN not configured',
        );
        return;
      }

      await this.client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text,
        mrkdwn: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send thread reply to ${channel}/${threadTs}: ${error.message}`,
        error.stack,
      );
      // Slack is non-blocking: log warning and continue
    }
  }

  /**
   * Send task notification based on event type
   */
  async sendTaskNotification(task: any, eventType: string): Promise<void> {
    try {
      if (!this.configService.get<string>('SLACK_BOT_TOKEN')) {
        this.logger.warn(
          'Cannot send notification: SLACK_BOT_TOKEN not configured',
        );
        return;
      }

      const slackUserId =
        task.slackUserId ||
        this.configService.get<string>('SLACK_DEFAULT_USER_ID');

      if (!slackUserId) {
        this.logger.warn('No Slack user ID found for notification');
        return;
      }

      let message: string;

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
    } catch (error) {
      this.logger.error(
        `Failed to send task notification: ${error.message}`,
        error.stack,
      );
      // Slack is non-blocking: log warning and continue
    }
  }

  /**
   * Send clarification questions as a DM thread
   */
  async sendClarificationQuestions(
    slackUserId: string,
    taskId: string,
    questions: string[],
  ): Promise<string | null> {
    try {
      if (!this.configService.get<string>('SLACK_BOT_TOKEN')) {
        this.logger.warn(
          'Cannot send clarification questions: SLACK_BOT_TOKEN not configured',
        );
        return null;
      }

      const message = this.formatClarificationQuestionsMessage(
        taskId,
        questions,
      );
      return await this.sendDM(slackUserId, message);
    } catch (error) {
      this.logger.error(
        `Failed to send clarification questions: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  // Formatting helpers
  private formatDispatchedMessage(task: any): string {
    const agent = task.recommendedAgent || 'AI agent';
    return (
      `*Task dispatched to ${agent}*\n\n` +
      `Task: ${task.llmSummary || task.description}\n` +
      `Issue: ${task.githubIssueUrl || 'Creating...'}`
    );
  }

  private formatPrOpenedMessage(task: any): string {
    return (
      `*PR ready for review*\n\n` +
      `Task: ${task.llmSummary || task.description}\n` +
      `PR: ${task.githubPrUrl}`
    );
  }

  private formatPrMergedMessage(task: any): string {
    return (
      `*Done! PR has been merged.*\n\n` +
      `Task: ${task.llmSummary || task.description}\n` +
      `PR: ${task.githubPrUrl}`
    );
  }

  private formatPrClosedMessage(task: any): string {
    return (
      `*PR needs attention*\n\n` +
      `Task: ${task.llmSummary || task.description}\n` +
      `PR: ${task.githubPrUrl}\n\n` +
      `The PR was closed without merging. Please review.`
    );
  }

  private formatAgentQuestionMessage(task: any): string {
    return (
      `*The agent has a question about your task*\n\n` +
      `Task: ${task.llmSummary || task.description}\n` +
      `Please check the GitHub issue for details.`
    );
  }

  private formatClarificationMessage(task: any): string {
    const questions = task.clarificationQuestions as string[];
    return (
      `*I need some clarification before creating the task*\n\n` +
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
      '\n\nPlease reply in this thread with your answers.'
    );
  }

  private formatClarificationQuestionsMessage(
    taskId: string,
    questions: string[],
  ): string {
    return (
      `*I need some clarification before dispatching your task*\n\n` +
      questions.map((q, i) => `${i + 1}. ${q}`).join('\n') +
      '\n\n_Please reply to this thread with your answers (one message is fine)._'
    );
  }
}
