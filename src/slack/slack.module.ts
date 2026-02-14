import { Module, forwardRef, Global } from '@nestjs/common';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack-webhook.controller';
import { SlackNotificationService } from './slack-notification.service';
import { TasksModule } from '../tasks/tasks.module';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [forwardRef(() => TasksModule), PrismaModule],
  controllers: [SlackWebhookController],
  providers: [
    SlackService,
    SlackNotificationService,
    {
      provide: 'SlackNotificationService',
      useExisting: SlackNotificationService,
    },
  ],
  exports: [SlackService, SlackNotificationService, 'SlackNotificationService'],
})
export class SlackModule {}
