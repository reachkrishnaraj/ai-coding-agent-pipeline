import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlackService } from './slack.service';
import { Task, TaskDocument } from '../common/schemas/task.schema';

@Injectable()
export class SlackNotificationService {
  private readonly logger = new Logger(SlackNotificationService.name);

  constructor(
    private readonly slackService: SlackService,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
  ) {}

  /**
   * Notify user when task is dispatched
   */
  async notifyTaskDispatched(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId).exec();

      if (!task) {
        return;
      }

      await this.slackService.sendTaskNotification(task, 'dispatched');
    } catch (error) {
      this.logger.error(`Failed to notify task dispatched: ${error.message}`);
    }
  }

  /**
   * Notify user when PR is opened
   */
  async notifyPROpened(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId).exec();

      if (!task) {
        return;
      }

      await this.slackService.sendTaskNotification(task, 'pr_opened');
    } catch (error) {
      this.logger.error(`Failed to notify PR opened: ${error.message}`);
    }
  }

  /**
   * Notify user when PR is merged
   */
  async notifyPRMerged(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId).exec();

      if (!task) {
        return;
      }

      await this.slackService.sendTaskNotification(task, 'pr_merged');
    } catch (error) {
      this.logger.error(`Failed to notify PR merged: ${error.message}`);
    }
  }

  /**
   * Notify user when PR is closed without merge
   */
  async notifyPRClosed(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId).exec();

      if (!task) {
        return;
      }

      await this.slackService.sendTaskNotification(task, 'pr_closed');
    } catch (error) {
      this.logger.error(`Failed to notify PR closed: ${error.message}`);
    }
  }

  /**
   * Notify user when agent asks a question
   */
  async notifyAgentQuestion(taskId: string): Promise<void> {
    try {
      const task = await this.taskModel.findById(taskId).exec();

      if (!task) {
        return;
      }

      await this.slackService.sendTaskNotification(task, 'agent_question');
    } catch (error) {
      this.logger.error(`Failed to notify agent question: ${error.message}`);
    }
  }
}
