import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReminderDocument = Reminder & Document;

@Schema({ timestamps: true, collection: 'reminders' })
export class Reminder {
  // Identity
  @Prop({ required: true, index: true })
  userId: string; // Target user's ID or GitHub username

  @Prop({ required: true, index: true })
  taskId: string; // Reference to task._id

  @Prop({ required: true, index: true })
  type: string; // 'stuck_clarification' | 'pr_review' | 'pr_overdue' | 'task_failed' | 'custom'

  @Prop({ required: true })
  title: string; // Human-readable title

  @Prop()
  description?: string; // Optional longer description

  // Schedule
  @Prop({ required: true, index: true })
  scheduledFor: Date; // When to trigger

  @Prop()
  nextRecurrenceAt?: Date; // When next reminder will trigger (null if one-time)

  @Prop({ default: 'pending', index: true })
  status: string; // 'pending' | 'sent' | 'snoozed' | 'dismissed' | 'completed' | 'failed'

  @Prop()
  sentAt?: Date; // When the reminder was sent

  // State management
  @Prop({ type: Object })
  payload: {
    taskTitle?: string;
    taskDescription?: string;
    githubUrl?: string;
    githubNumber?: number;
    errorMessage?: string;
    [key: string]: any;
  };

  @Prop({ index: true, sparse: true })
  snoozeUntil?: Date;

  @Prop({ default: 0 })
  snoozeCount: number;

  @Prop()
  dismissedAt?: Date;

  @Prop()
  dismissReason?: string; // 'not_applicable' | 'already_aware' | 'will_handle_later'

  // Configuration
  @Prop({ default: 0 })
  recurrenceCount: number; // How many times has this reminder fired

  @Prop()
  maxRecurrences?: number; // Max times to send (null = infinite)

  @Prop({ default: 0 })
  failureCount: number; // How many times sending failed

  @Prop({ type: [String], default: [] })
  sentVia: string[]; // ['in-app'] | ['email'] | ['slack'] | combinations

  @Prop({ type: Object })
  metadata?: {
    prNumber?: number;
    prStatus?: string;
    clarificationAge?: number; // hours
    [key: string]: any;
  };
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);

// Compound indexes for efficient queries
ReminderSchema.index({ userId: 1, status: 1 });
ReminderSchema.index({ taskId: 1, type: 1 });
ReminderSchema.index({ scheduledFor: 1 });
ReminderSchema.index({ snoozeUntil: 1 }, { sparse: true });
ReminderSchema.index({ type: 1, status: 1 });

// Virtual for id
ReminderSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
