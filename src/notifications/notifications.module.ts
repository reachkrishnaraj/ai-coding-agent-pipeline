import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';
import {
  NotificationPreference,
  NotificationPreferenceSchema,
} from '../common/schemas/notification-preference.schema';
import {
  NotificationLog,
  NotificationLogSchema,
} from '../common/schemas/notification-log.schema';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NotificationPreference.name, schema: NotificationPreferenceSchema },
      { name: NotificationLog.name, schema: NotificationLogSchema },
    ]),
    SlackModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
