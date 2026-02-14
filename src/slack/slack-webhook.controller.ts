import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service';
import { TasksService } from '../tasks/tasks.service';
import * as crypto from 'crypto';

interface SlackSlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  event?: {
    type: string;
    channel: string;
    user: string;
    text: string;
    ts: string;
    thread_ts?: string;
    channel_type?: string;
  };
}

@Controller('api/webhooks/slack')
export class SlackWebhookController {
  private readonly logger = new Logger(SlackWebhookController.name);

  constructor(
    private readonly slackService: SlackService,
    private readonly tasksService: TasksService,
    private readonly configService: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
  ) {
    // Verify Slack signature
    if (
      !this.verifySlackSignature(JSON.stringify(body), signature, timestamp)
    ) {
      this.logger.warn('Invalid Slack signature');
      throw new BadRequestException('Invalid signature');
    }

    // Handle URL verification challenge (one-time setup)
    if (body.type === 'url_verification') {
      return { challenge: body.challenge };
    }

    // Handle slash command
    if (body.command === '/ai-task') {
      return this.handleSlashCommand(body as SlackSlashCommandPayload);
    }

    // Handle event callback (DM thread replies)
    if (body.type === 'event_callback') {
      // Process asynchronously to respond within 3 seconds
      setImmediate(() => this.handleEvent(body as SlackEventPayload));
      return { ok: true };
    }

    this.logger.warn(`Unknown Slack webhook payload type: ${body.type}`);
    return { ok: true };
  }

  /**
   * Handle /ai-task slash command
   */
  private async handleSlashCommand(payload: SlackSlashCommandPayload) {
    const description = payload.text.trim();

    if (!description) {
      return {
        text: 'Please provide a task description. Usage: `/ai-task Fix the payment status bug`',
        response_type: 'ephemeral',
      };
    }

    try {
      // Create task via TasksService
      const task = await this.tasksService.create({
        description,
        source: 'slack',
        createdBy: payload.user_id,
        repo:
          this.configService.get<string>('DEFAULT_REPO') ||
          'mothership/finance-service',
      }) as unknown as { id: string; status: string; clarificationQuestions?: string[]; agent?: string; issue_url?: string };

      // Store Slack user ID on the task
      await this.tasksService.updateSlackInfo(
        task.id,
        payload.user_id,
        payload.channel_id,
      );

      // Check if clarification is needed
      if (task.status === 'needs_clarification') {
        const questions = task.clarificationQuestions || [];

        // Send questions as DM thread
        const threadTs = await this.slackService.sendClarificationQuestions(
          payload.user_id,
          task.id,
          questions,
        );

        // Store thread_ts for matching replies
        if (threadTs) {
          await this.tasksService.updateSlackThreadTs(task.id, threadTs);
        }

        return {
          text: "Analyzing your task... I've sent you a DM with some questions.",
          response_type: 'ephemeral',
        };
      }

      // Task was dispatched immediately
      return {
        text: `Task dispatched to ${task.agent || 'AI agent'}. Issue: ${task.issue_url}`,
        response_type: 'ephemeral',
      };
    } catch (error) {
      this.logger.error(
        `Failed to handle slash command: ${error.message}`,
        error.stack,
      );
      return {
        text: `Error creating task: ${error.message}`,
        response_type: 'ephemeral',
      };
    }
  }

  /**
   * Handle Slack events (DM thread replies)
   */
  private async handleEvent(payload: SlackEventPayload) {
    const event = payload.event;

    if (!event) {
      return;
    }

    // Only handle DM messages
    if (event.type === 'message' && event.channel_type === 'im') {
      // Ignore bot messages
      if ((event as any).bot_id || (event as any).subtype) {
        return;
      }

      // Check if this is a thread reply
      if (event.thread_ts) {
        await this.handleThreadReply(event);
      }
    }
  }

  /**
   * Handle thread reply (clarification answer)
   */
  private async handleThreadReply(event: any) {
    try {
      const threadTs = event.thread_ts;
      const answerText = event.text;

      // Find task by thread_ts using the proper service method
      const task = await this.tasksService.findBySlackThread(threadTs);

      if (!task) {
        this.logger.warn(`No task found for thread_ts: ${threadTs}`);
        return;
      }

      const taskId = task._id.toString();

      // Parse answers from the reply text
      const questions = task.clarificationQuestions || [];
      const answers = this.parseAnswersFromText(answerText, questions.length);

      // Submit clarification
      const result = await this.tasksService.clarify(taskId, { answers }) as unknown as { agent?: string; issue_url?: string };

      // Send confirmation in the thread
      await this.slackService.sendThreadReply(
        event.channel,
        threadTs,
        `Got it! Task dispatched to ${result.agent || 'AI agent'}.\n\nIssue: ${result.issue_url}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle thread reply: ${error.message}`,
        error.stack,
      );

      // Send error message to user
      if (event.channel && event.thread_ts) {
        await this.slackService.sendThreadReply(
          event.channel,
          event.thread_ts,
          `Sorry, I couldn't process your answers: ${error.message}`,
        );
      }
    }
  }

  /**
   * Parse answers from user's reply text
   * Supports numbered lists or just plain text split by newlines
   */
  private parseAnswersFromText(text: string, expectedCount: number): string[] {
    // Try to parse numbered list first (1. answer, 2. answer, etc.)
    const numberedPattern = /^\d+\.\s*(.+)$/gm;
    const numberedMatches = [...text.matchAll(numberedPattern)];

    if (numberedMatches.length === expectedCount) {
      return numberedMatches.map((match) => match[1].trim());
    }

    // Fallback: split by newlines and filter empty lines
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // If we have exactly the expected count, use them
    if (lines.length === expectedCount) {
      return lines;
    }

    // If we only expected one answer, return the whole text
    if (expectedCount === 1) {
      return [text.trim()];
    }

    // Otherwise, take the first N lines
    return lines.slice(0, expectedCount);
  }

  /**
   * Verify Slack request signature
   */
  private verifySlackSignature(
    body: string,
    signature: string,
    timestamp: string,
  ): boolean {
    const signingSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
    );

    if (!signingSecret) {
      this.logger.warn(
        'SLACK_SIGNING_SECRET not configured. Skipping signature verification.',
      );
      return true; // Allow in development
    }

    if (!signature || !timestamp) {
      return false;
    }

    // Reject old requests (replay attack prevention)
    const now = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(now - requestTime) > 60 * 5) {
      this.logger.warn('Slack request timestamp too old');
      return false;
    }

    // Compute HMAC
    const sigBasestring = `v0:${timestamp}:${body}`;
    const hmac = crypto
      .createHmac('sha256', signingSecret)
      .update(sigBasestring)
      .digest('hex');
    const computedSignature = `v0=${hmac}`;

    // Compare signatures (constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature),
    );
  }
}
