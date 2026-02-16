import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('api/reminders')
@UseGuards(AuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  /**
   * GET /api/reminders
   * List reminders for current user
   */
  @Get()
  async getReminders(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('taskId') taskId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user?.username || 'unknown';

    const result = await this.remindersService.getReminders(userId, {
      status,
      type,
      taskId,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    return {
      reminders: result.reminders,
      total: result.total,
      page: page || 1,
      limit: limit || 20,
    };
  }

  /**
   * GET /api/reminders/summary
   * Get summary of reminders for dashboard widget
   */
  @Get('summary')
  async getReminderSummary(@Req() req: any) {
    const userId = req.user?.username || 'unknown';
    return this.remindersService.getReminderSummary(userId);
  }

  /**
   * GET /api/reminders/preferences
   * Get user's reminder preferences
   */
  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const userId = req.user?.username || 'unknown';
    return this.remindersService.getOrCreatePreferences(userId);
  }

  /**
   * PATCH /api/reminders/preferences
   * Update reminder preferences
   */
  @Patch('preferences')
  async updatePreferences(@Req() req: any, @Body() updates: any) {
    const userId = req.user?.username || 'unknown';
    return this.remindersService.updatePreferences(userId, updates);
  }

  /**
   * POST /api/reminders/:id/snooze
   * Snooze a reminder
   */
  @Post(':id/snooze')
  async snoozeReminder(
    @Param('id') id: string,
    @Body('durationHours') durationHours: number,
  ) {
    const reminder = await this.remindersService.snoozeReminder(
      id,
      durationHours,
    );

    return {
      id: reminder['_id'].toString(),
      status: reminder.status,
      snoozeUntil: reminder.snoozeUntil,
      message: `Reminder snoozed until ${reminder.snoozeUntil!.toISOString()}`,
    };
  }

  /**
   * POST /api/reminders/:id/dismiss
   * Dismiss a reminder
   */
  @Post(':id/dismiss')
  async dismissReminder(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    const reminder = await this.remindersService.dismissReminder(id, reason);

    return {
      id: reminder['_id'].toString(),
      status: reminder.status,
      dismissedAt: reminder.dismissedAt,
    };
  }

  /**
   * POST /api/reminders/:id/undo-dismiss
   * Undo dismiss
   */
  @Post(':id/undo-dismiss')
  async undoDismiss(@Param('id') id: string) {
    const reminder = await this.remindersService.undoDismiss(id);

    return {
      id: reminder['_id'].toString(),
      status: reminder.status,
      dismissedAt: reminder.dismissedAt,
    };
  }

  /**
   * DELETE /api/reminders/:id
   * Delete a reminder
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReminder(@Param('id') id: string) {
    await this.remindersService.deleteReminder(id);
  }

  /**
   * POST /api/reminders
   * Create a custom reminder
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCustomReminder(
    @Req() req: any,
    @Body() body: {
      taskId: string;
      title: string;
      description?: string;
      scheduledFor: string;
      recurring?: { enabled: boolean };
      channels?: string[];
    },
  ) {
    const userId = req.user?.username || 'unknown';

    const reminder = await this.remindersService.createReminder({
      userId,
      taskId: body.taskId,
      type: 'custom',
      title: body.title,
      description: body.description,
      scheduledFor: new Date(body.scheduledFor),
      maxRecurrences: body.recurring?.enabled ? undefined : 1,
      payload: {
        channels: body.channels,
      },
    });

    return {
      id: reminder['_id'].toString(),
      taskId: reminder.taskId,
      type: reminder.type,
      title: reminder.title,
      status: reminder.status,
      scheduledFor: reminder.scheduledFor,
    };
  }
}
