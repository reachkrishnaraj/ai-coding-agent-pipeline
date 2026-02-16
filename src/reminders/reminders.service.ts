import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Reminder } from '../common/schemas/reminder.schema';
import { ReminderPreference } from '../common/schemas/reminder-preference.schema';
import { Task } from '../common/schemas/task.schema';
import { TaskStatus } from '../common/enums/task-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectModel(Reminder.name) private reminderModel: Model<Reminder>,
    @InjectModel(ReminderPreference.name)
    private reminderPreferenceModel: Model<ReminderPreference>,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    private notificationsService: NotificationsService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new reminder
   */
  async createReminder(params: {
    userId: string;
    taskId: string;
    type: string;
    title: string;
    description?: string;
    scheduledFor: Date;
    maxRecurrences?: number;
    payload?: Record<string, any>;
  }): Promise<Reminder> {
    this.logger.log(
      `Creating reminder: ${params.type} for user ${params.userId}, task ${params.taskId}`,
    );

    const reminder = await this.reminderModel.create({
      userId: params.userId,
      taskId: params.taskId,
      type: params.type,
      title: params.title,
      description: params.description,
      scheduledFor: params.scheduledFor,
      maxRecurrences: params.maxRecurrences,
      payload: params.payload || {},
      status: 'pending',
      recurrenceCount: 0,
      snoozeCount: 0,
      failureCount: 0,
      sentVia: [],
    });

    return reminder;
  }

  /**
   * Find pending reminders that are due
   */
  async findPending(): Promise<Reminder[]> {
    const now = new Date();

    const reminders = await this.reminderModel.find({
      status: { $in: ['pending', 'snoozed'] },
      scheduledFor: { $lte: now },
      $or: [{ snoozeUntil: null }, { snoozeUntil: { $lte: now } }],
    });

    return reminders;
  }

  /**
   * Send a reminder
   */
  async sendReminder(reminderId: string): Promise<void> {
    const reminder = await this.reminderModel.findById(reminderId);

    if (!reminder) {
      this.logger.warn(`Reminder ${reminderId} not found`);
      return;
    }

    // Re-evaluate if reminder is still valid
    const isValid = await this.evaluateReminder(reminder);
    if (!isValid) {
      this.logger.debug(`Reminder ${reminderId} no longer valid, marking completed`);
      await reminder.save();
      return;
    }

    try {
      // Get user preferences
      const prefs = await this.getOrCreatePreferences(reminder.userId);

      // Check if this reminder type is enabled
      if (!this.isReminderTypeEnabled(prefs, reminder.type)) {
        this.logger.debug(
          `Reminder type ${reminder.type} disabled for user ${reminder.userId}`,
        );
        reminder.status = 'completed';
        await reminder.save();
        return;
      }

      // Check quiet hours
      if (this.isInQuietHours(prefs)) {
        this.logger.debug(
          `User ${reminder.userId} in quiet hours, skipping reminder`,
        );
        return;
      }

      // Send via enabled channels
      await this.notificationsService.sendNotification(
        reminder.userId,
        `reminder_${reminder.type}`,
        {
          ...reminder.payload,
          taskId: reminder.taskId,
          reminderId: reminderId,
          reminderTitle: reminder.title,
          reminderDescription: reminder.description,
        },
      );

      // Update reminder status
      reminder.status = 'sent';
      reminder.sentAt = new Date();
      reminder.recurrenceCount += 1;
      reminder.sentVia = this.getEnabledChannels(prefs);

      // Schedule next recurrence if applicable
      if (
        reminder.maxRecurrences &&
        reminder.recurrenceCount >= reminder.maxRecurrences
      ) {
        reminder.status = 'completed';
        reminder.nextRecurrenceAt = undefined;
      } else if (this.shouldRecur(reminder.type)) {
        reminder.nextRecurrenceAt = this.calculateNextRecurrence(
          reminder.type,
          prefs,
        );
        reminder.status = 'pending';
        reminder.scheduledFor = reminder.nextRecurrenceAt;
      } else {
        reminder.status = 'completed';
      }

      await reminder.save();

      this.logger.log(
        `Reminder ${reminderId} sent successfully (${reminder.type})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send reminder ${reminderId}: ${error.message}`,
        error.stack,
      );

      reminder.failureCount += 1;
      if (reminder.failureCount >= 3) {
        reminder.status = 'failed';
      }
      await reminder.save();
    }
  }

  /**
   * Snooze a reminder
   */
  async snoozeReminder(
    reminderId: string,
    durationHours: number,
  ): Promise<Reminder> {
    const reminder = await this.reminderModel.findById(reminderId);

    if (!reminder) {
      throw new NotFoundException(`Reminder ${reminderId} not found`);
    }

    const snoozeUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    reminder.status = 'snoozed';
    reminder.snoozeUntil = snoozeUntil;
    reminder.snoozeCount += 1;

    await reminder.save();

    // Log snooze in user preferences
    const prefs = await this.getOrCreatePreferences(reminder.userId);
    prefs.snoozedReminders.push({
      reminderId: reminderId,
      snoozedAt: new Date(),
      snoozeDurationHours: durationHours,
      snoozedUntil: snoozeUntil,
    });
    await (prefs as any).save();

    this.logger.log(
      `Reminder ${reminderId} snoozed until ${snoozeUntil.toISOString()}`,
    );

    return reminder;
  }

  /**
   * Dismiss a reminder
   */
  async dismissReminder(
    reminderId: string,
    reason?: string,
  ): Promise<Reminder> {
    const reminder = await this.reminderModel.findById(reminderId);

    if (!reminder) {
      throw new NotFoundException(`Reminder ${reminderId} not found`);
    }

    reminder.status = 'dismissed';
    reminder.dismissedAt = new Date();
    reminder.dismissReason = reason;

    await reminder.save();

    this.logger.log(`Reminder ${reminderId} dismissed`);

    return reminder;
  }

  /**
   * Undo dismiss
   */
  async undoDismiss(reminderId: string): Promise<Reminder> {
    const reminder = await this.reminderModel.findById(reminderId);

    if (!reminder) {
      throw new NotFoundException(`Reminder ${reminderId} not found`);
    }

    reminder.status = 'pending';
    reminder.dismissedAt = undefined;
    reminder.dismissReason = undefined;

    await reminder.save();

    this.logger.log(`Reminder ${reminderId} dismiss undone`);

    return reminder;
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(reminderId: string): Promise<void> {
    await this.reminderModel.findByIdAndDelete(reminderId);
    this.logger.log(`Reminder ${reminderId} deleted`);
  }

  /**
   * Get reminders for a user
   */
  async getReminders(
    userId: string,
    filters?: {
      status?: string;
      type?: string;
      taskId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ reminders: Reminder[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    const query: any = { userId };

    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;
    if (filters?.taskId) query.taskId = filters.taskId;

    const [reminders, total] = await Promise.all([
      this.reminderModel
        .find(query)
        .sort({ scheduledFor: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.reminderModel.countDocuments(query),
    ]);

    return { reminders, total };
  }

  /**
   * Get reminder summary for dashboard
   */
  async getReminderSummary(userId: string): Promise<{
    pending: number;
    snoozed: number;
    overdue: Array<{
      taskId: string;
      title: string;
      type: string;
      overdueSince: string;
      link: string;
    }>;
  }> {
    const now = new Date();

    const [pending, snoozed, overdue] = await Promise.all([
      this.reminderModel.countDocuments({ userId, status: 'pending' }),
      this.reminderModel.countDocuments({ userId, status: 'snoozed' }),
      this.reminderModel
        .find({
          userId,
          status: 'pending',
          scheduledFor: { $lt: now },
        })
        .limit(5)
        .exec(),
    ]);

    const overdueFormatted = overdue.map((r) => ({
      taskId: r.taskId,
      title: r.title,
      type: r.type,
      overdueSince: this.formatOverdueTime(
        now.getTime() - r.scheduledFor.getTime(),
      ),
      link: `/tasks/${r.taskId}`,
    }));

    return { pending, snoozed, overdue: overdueFormatted };
  }

  /**
   * Get or create reminder preferences
   */
  async getOrCreatePreferences(
    userId: string,
  ): Promise<ReminderPreference> {
    let prefs = await this.reminderPreferenceModel.findOne({ userId });

    if (!prefs) {
      prefs = await this.reminderPreferenceModel.create({
        userId,
        channels: { inApp: true, email: true, slack: true },
        reminders: {
          stuckClarification: true,
          prReviewReady: true,
          prOpenTooLong: true,
          failedTasks: true,
          customReminders: true,
        },
        thresholds: {
          clarificationDelayHours: 24,
          prOpenDaysThreshold: 3,
          prReviewReminderIntervalHours: 48,
        },
        digest: {
          enabled: false,
          frequency: 'daily',
          time: '09:00',
          timezone: 'UTC',
          categories: [],
        },
        quietHours: {
          enabled: false,
          startTime: '18:00',
          endTime: '09:00',
          timezone: 'UTC',
        },
        repoPreferences: new Map(),
        snoozedReminders: [],
      });
    }

    return prefs;
  }

  /**
   * Update reminder preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<ReminderPreference>,
  ): Promise<ReminderPreference> {
    const prefs = await this.getOrCreatePreferences(userId);

    Object.assign(prefs, updates);

    await (prefs as any).save();
    return prefs;
  }

  /**
   * Event handler: Task status changed
   */
  @OnEvent('task.status_changed')
  async onTaskStatusChanged(payload: {
    task: Task;
    newStatus: TaskStatus;
  }): Promise<void> {
    const { task, newStatus } = payload;

    try {
      // Get user preferences
      const prefs = await this.getOrCreatePreferences(task.createdBy || 'unknown');

      switch (newStatus) {
        case TaskStatus.NEEDS_CLARIFICATION:
          if (prefs.reminders.stuckClarification) {
            const scheduledFor = new Date(
              Date.now() + prefs.thresholds.clarificationDelayHours * 60 * 60 * 1000,
            );

            await this.createReminder({
              userId: task.createdBy || 'unknown',
              taskId: task['_id'].toString(),
              type: 'stuck_clarification',
              title: `Task waiting for clarification: ${task.llmSummary || task.description}`,
              scheduledFor,
              maxRecurrences: 7,
              payload: {
                taskTitle: task.llmSummary,
                taskDescription: task.description,
                clarificationAge: prefs.thresholds.clarificationDelayHours,
                questions: task.clarificationQuestions || [],
              },
            });
          }
          break;

        case TaskStatus.PR_OPEN:
          if (prefs.reminders.prReviewReady) {
            await this.createReminder({
              userId: task.createdBy || 'unknown',
              taskId: task['_id'].toString(),
              type: 'pr_review',
              title: `PR #${task.githubPrNumber} ready for review`,
              scheduledFor: new Date(), // Immediate
              maxRecurrences: 5,
              payload: {
                taskTitle: task.llmSummary,
                prNumber: task.githubPrNumber,
                prUrl: task.githubPrUrl,
                githubUrl: task.githubPrUrl,
              },
            });
          }
          break;

        case TaskStatus.FAILED:
          if (prefs.reminders.failedTasks) {
            await this.createReminder({
              userId: task.createdBy || 'unknown',
              taskId: task['_id'].toString(),
              type: 'task_failed',
              title: `Task failed: ${task.llmSummary || task.description}`,
              description: task.errorMessage,
              scheduledFor: new Date(), // Immediate
              maxRecurrences: 3,
              payload: {
                taskTitle: task.llmSummary,
                taskDescription: task.description,
                errorMessage: task.errorMessage,
              },
            });
          }
          break;
      }
    } catch (error) {
      this.logger.error(
        `Failed to create reminder for task ${task['_id']}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Evaluate if reminder is still valid
   */
  private async evaluateReminder(reminder: Reminder): Promise<boolean> {
    const task = await this.taskModel.findById(reminder.taskId);

    if (!task) {
      reminder.status = 'completed';
      return false;
    }

    if (reminder.dismissedAt) {
      // Check if condition has changed since dismiss
      if (this.hasConditionChanged(reminder, task)) {
        reminder.dismissedAt = undefined; // Clear dismiss
      } else {
        return false; // Still dismissed
      }
    }

    if (reminder.snoozeUntil && reminder.snoozeUntil > new Date()) {
      return false; // Snooze still active
    } else if (reminder.snoozeUntil) {
      reminder.snoozeUntil = undefined; // Clear expired snooze
      reminder.status = 'pending';
    }

    // Re-evaluate condition
    const condition = this.evaluateCondition(reminder, task);
    if (!condition) {
      reminder.status = 'completed';
      return false;
    }

    return true;
  }

  /**
   * Evaluate if condition for reminder is met
   */
  private evaluateCondition(reminder: Reminder, task: Task): boolean {
    const now = new Date();

    switch (reminder.type) {
      case 'stuck_clarification':
        if (task.status !== TaskStatus.NEEDS_CLARIFICATION) return false;
        const clarHours =
          (now.getTime() - new Date((task as any).updatedAt).getTime()) / (1000 * 60 * 60);
        return clarHours >= 24;

      case 'pr_review':
        return (
          task.status === TaskStatus.PR_OPEN && task.githubPrStatus === 'open'
        );

      case 'pr_overdue':
        if (task.status !== TaskStatus.PR_OPEN) return false;
        const prDays =
          (now.getTime() - new Date(task.dispatchedAt!).getTime()) /
          (1000 * 60 * 60 * 24);
        return prDays >= 3 && task.githubPrStatus === 'open';

      case 'task_failed':
        return task.status === TaskStatus.FAILED;

      case 'custom':
        return true; // Always valid; user-created reminders don't re-evaluate

      default:
        return false;
    }
  }

  /**
   * Check if condition has changed since dismissal
   */
  private hasConditionChanged(reminder: Reminder, task: Task): boolean {
    // If task status changed significantly, clear dismiss
    switch (reminder.type) {
      case 'pr_overdue':
        return task.status !== TaskStatus.PR_OPEN;
      case 'task_failed':
        return task.status !== TaskStatus.FAILED;
      default:
        return false;
    }
  }

  /**
   * Check if reminder type is enabled in preferences
   */
  private isReminderTypeEnabled(
    prefs: ReminderPreference,
    type: string,
  ): boolean {
    const typeMap: Record<string, keyof typeof prefs.reminders> = {
      stuck_clarification: 'stuckClarification',
      pr_review: 'prReviewReady',
      pr_overdue: 'prOpenTooLong',
      task_failed: 'failedTasks',
      custom: 'customReminders',
    };

    const key = typeMap[type];
    return key ? prefs.reminders[key] : true;
  }

  /**
   * Check if user is in quiet hours
   */
  private isInQuietHours(prefs: ReminderPreference): boolean {
    if (!prefs.quietHours.enabled) {
      return false;
    }

    const now = new Date();

    const [startHour, startMin] = prefs.quietHours.startTime
      .split(':')
      .map(Number);
    const [endHour, endMin] = prefs.quietHours.endTime.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  /**
   * Get enabled channels from preferences
   */
  private getEnabledChannels(prefs: ReminderPreference): string[] {
    const channels: string[] = [];
    if (prefs.channels.inApp) channels.push('in-app');
    if (prefs.channels.email) channels.push('email');
    if (prefs.channels.slack) channels.push('slack');
    return channels;
  }

  /**
   * Check if reminder should recur
   */
  private shouldRecur(type: string): boolean {
    return ['stuck_clarification', 'pr_review', 'pr_overdue'].includes(type);
  }

  /**
   * Calculate next recurrence time
   */
  private calculateNextRecurrence(
    type: string,
    prefs: ReminderPreference,
  ): Date {
    const now = new Date();

    switch (type) {
      case 'stuck_clarification':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      case 'pr_review':
        return new Date(
          now.getTime() +
            prefs.thresholds.prReviewReminderIntervalHours * 60 * 60 * 1000,
        ); // 48 hours default

      case 'pr_overdue':
        return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days

      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default 24 hours
    }
  }

  /**
   * Format overdue time
   */
  private formatOverdueTime(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    return `${days}d`;
  }
}
