import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import {
  Reminder,
  ReminderSchema,
} from '../common/schemas/reminder.schema';
import {
  ReminderPreference,
  ReminderPreferenceSchema,
} from '../common/schemas/reminder-preference.schema';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reminder.name, schema: ReminderSchema },
      { name: ReminderPreference.name, schema: ReminderPreferenceSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
    EventEmitterModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
