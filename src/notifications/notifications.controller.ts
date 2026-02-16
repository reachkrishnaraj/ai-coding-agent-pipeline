import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Query,
  Param,
  Res,
  UseGuards,
  Request,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { NotificationsService } from './notifications.service';
import { NotificationPreference } from '../common/schemas/notification-preference.schema';

// Note: Add proper auth guard when available
// import { AuthGuard } from '../auth/guards/auth.guard';

@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/notifications/preferences
   * Get current user's notification preferences
   */
  @Get('preferences')
  // @UseGuards(AuthGuard)
  async getPreferences(@Request() req: any) {
    const userId = req.user?.username || req.session?.user?.username || 'test-user';
    const prefs = await this.notificationsService.getOrCreatePreferences(userId);
    return prefs;
  }

  /**
   * PATCH /api/notifications/preferences
   * Update notification preferences
   */
  @Patch('preferences')
  // @UseGuards(AuthGuard)
  async updatePreferences(@Request() req: any, @Body() updates: Partial<NotificationPreference>) {
    const userId = req.user?.username || req.session?.user?.username || 'test-user';
    const prefs = await this.notificationsService.updatePreferences(userId, updates);
    return prefs;
  }

  /**
   * POST /api/notifications/preferences/reset
   * Reset preferences to defaults
   */
  @Post('preferences/reset')
  // @UseGuards(AuthGuard)
  async resetPreferences(@Request() req: any) {
    const userId = req.user?.username || req.session?.user?.username || 'test-user';

    // Delete existing preferences to trigger recreation with defaults
    await this.notificationsService.updatePreferences(userId, {
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
    });

    const prefs = await this.notificationsService.getOrCreatePreferences(userId);
    return prefs;
  }

  /**
   * GET /api/notifications/history
   * Get notification history
   */
  @Get('history')
  // @UseGuards(AuthGuard)
  async getHistory(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('eventType') eventType?: string,
    @Query('taskId') taskId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user?.username || req.session?.user?.username || 'test-user';

    const filters: any = { userId };
    if (status) filters.status = status;
    if (channel) filters.channel = channel;
    if (eventType) filters.eventType = eventType;
    if (taskId) filters.taskId = taskId;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    const result = await this.notificationsService.getNotificationHistory(
      filters,
      pageNum,
      limitNum,
    );

    return {
      logs: result.logs,
      total: result.total,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * GET /api/notifications/preferences/unsubscribe/:token
   * Unsubscribe from notifications
   */
  @Get('preferences/unsubscribe/:token')
  async unsubscribe(
    @Param('token') token: string,
    @Query('channel') channel?: 'email' | 'slack_dm' | 'slack_channel',
    @Res() res?: any,
  ) {
    const prefs = await this.notificationsService.unsubscribe(token, channel);

    if (!prefs) {
      throw new NotFoundException('Invalid unsubscribe token');
    }

    // Return HTML page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed - AI Pipeline</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #2563eb; }
          .message { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          a { color: #2563eb; text-decoration: none; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <h1>Unsubscribed</h1>
        <div class="message">
          <p>You have been unsubscribed from ${channel || 'all'} notifications.</p>
          <p>If this was a mistake, you can resubscribe at any time.</p>
        </div>
        <a href="/api/notifications/preferences/resubscribe/${token}${channel ? `?channel=${channel}` : ''}" class="button">Resubscribe</a>
        <a href="/settings/notifications" class="button">Manage Preferences</a>
      </body>
      </html>
    `;

    res!.status(HttpStatus.OK).send(html);
  }

  /**
   * GET /api/notifications/preferences/resubscribe/:token
   * Resubscribe to notifications
   */
  @Get('preferences/resubscribe/:token')
  async resubscribe(
    @Param('token') token: string,
    @Query('channel') channel?: 'email' | 'slack_dm' | 'slack_channel',
    @Res() res?: any,
  ) {
    const prefs = await this.notificationsService.resubscribe(token, channel);

    if (!prefs) {
      throw new NotFoundException('Invalid token');
    }

    // Return HTML page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Resubscribed - AI Pipeline</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          h1 { color: #2563eb; }
          .message { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          a { color: #2563eb; text-decoration: none; }
          .button { display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; margin: 10px 5px; }
        </style>
      </head>
      <body>
        <h1>Resubscribed</h1>
        <div class="message">
          <p>You have been resubscribed to ${channel || 'all'} notifications.</p>
          <p>You will now receive notifications again.</p>
        </div>
        <a href="/settings/notifications" class="button">Manage Preferences</a>
        <a href="/" class="button">Back to Dashboard</a>
      </body>
      </html>
    `;

    res!.status(HttpStatus.OK).send(html);
  }

  /**
   * GET /api/notifications/quiet-hours/status
   * Get current quiet hours status
   */
  @Get('quiet-hours/status')
  // @UseGuards(AuthGuard)
  async getQuietHoursStatus(@Request() req: any) {
    const userId = req.user?.username || req.session?.user?.username || 'test-user';
    const prefs = await this.notificationsService.getOrCreatePreferences(userId);

    // Calculate if currently in quiet hours
    const now = new Date();
    const dayOfWeek = now.getDay();
    const isQuietDay = prefs.quietHours.daysOfWeek.includes(dayOfWeek);

    const [startHour, startMin] = prefs.quietHours.startTime.split(':').map(Number);
    const [endHour, endMin] = prefs.quietHours.endTime.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    let isCurrentlyQuiet = false;
    if (prefs.quietHours.enabled && isQuietDay) {
      if (startMinutes > endMinutes) {
        isCurrentlyQuiet = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else {
        isCurrentlyQuiet = currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }
    }

    // Calculate next delivery time
    let quietUntil: Date | null = null;
    if (isCurrentlyQuiet) {
      quietUntil = new Date(now);
      quietUntil.setHours(endHour, endMin, 0, 0);
      if (quietUntil < now) {
        quietUntil.setDate(quietUntil.getDate() + 1);
      }
    }

    return {
      quietHoursEnabled: prefs.quietHours.enabled,
      isCurrentlyQuiet,
      currentTime: now.toISOString(),
      quietUntil: quietUntil?.toISOString(),
      nextDeliveryTime: quietUntil?.toISOString(),
      timezone: prefs.timezone,
    };
  }
}
