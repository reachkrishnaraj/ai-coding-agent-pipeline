import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ReminderPreferenceDocument = ReminderPreference & Document;

@Schema({ timestamps: true, collection: 'reminder_preferences' })
export class ReminderPreference {
  @Prop({ required: true, unique: true, index: true })
  userId: string; // GitHub username

  // Notification channels
  @Prop({
    type: Object,
    default: { inApp: true, email: true, slack: true },
  })
  channels: {
    inApp: boolean; // Default: true
    email: boolean; // Default: true
    slack: boolean; // Default: true (if Slack linked)
  };

  // Reminder type toggles
  @Prop({
    type: Object,
    default: {
      stuckClarification: true,
      prReviewReady: true,
      prOpenTooLong: true,
      failedTasks: true,
      customReminders: true,
    },
  })
  reminders: {
    stuckClarification: boolean; // Default: true
    prReviewReady: boolean; // Default: true
    prOpenTooLong: boolean; // Default: true
    failedTasks: boolean; // Default: true
    customReminders: boolean; // Default: true
  };

  // Thresholds (hours/days)
  @Prop({
    type: Object,
    default: {
      clarificationDelayHours: 24,
      prOpenDaysThreshold: 3,
      prReviewReminderIntervalHours: 48,
    },
  })
  thresholds: {
    clarificationDelayHours: number; // Default: 24
    prOpenDaysThreshold: number; // Default: 3
    prReviewReminderIntervalHours: number; // Default: 48
  };

  // Digest preferences
  @Prop({
    type: Object,
    default: {
      enabled: false,
      frequency: 'daily',
      time: '09:00',
      timezone: 'UTC',
      categories: [],
    },
  })
  digest: {
    enabled: boolean; // Default: false
    frequency: 'daily' | 'weekly'; // Default: 'daily'
    time: string; // HH:MM in user's timezone, default: "09:00"
    timezone: string; // IANA timezone, default: "UTC"
    categories: string[]; // Which reminder types to include
  };

  // Quiet hours
  @Prop({
    type: Object,
    default: {
      enabled: false,
      startTime: '18:00',
      endTime: '09:00',
      timezone: 'UTC',
    },
  })
  quietHours: {
    enabled: boolean; // Default: false
    startTime: string; // HH:MM, default: "18:00"
    endTime: string; // HH:MM, default: "09:00" (next day)
    timezone: string; // IANA timezone, default: "UTC"
  };

  // Repo overrides
  @Prop({ type: Map, of: Object, default: {} })
  repoPreferences: Map<
    string,
    {
      enabled: boolean;
      channels: string[];
      customThresholds?: {
        clarificationDelayHours?: number;
        prOpenDaysThreshold?: number;
      };
    }
  >;

  // Snooze history (for analytics)
  @Prop({ type: [Object], default: [] })
  snoozedReminders: Array<{
    reminderId: string;
    snoozedAt: Date;
    snoozeDurationHours: number;
    snoozedUntil: Date;
  }>;
}

export const ReminderPreferenceSchema =
  SchemaFactory.createForClass(ReminderPreference);

// Virtual for id
ReminderPreferenceSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
