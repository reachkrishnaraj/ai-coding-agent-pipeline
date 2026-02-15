import { Module, forwardRef, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SlackService } from './slack.service';
import { SlackWebhookController } from './slack-webhook.controller';
import { SlackNotificationService } from './slack-notification.service';
import { TasksModule } from '../tasks/tasks.module';
import { Task, TaskSchema } from '../common/schemas/task.schema';

@Global()
@Module({
  imports: [
    forwardRef(() => TasksModule),
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
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
