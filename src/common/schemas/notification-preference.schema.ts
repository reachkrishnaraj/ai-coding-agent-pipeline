import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationPreferenceDocument = NotificationPreference & Document;

@Schema({ timestamps: true, collection: 'notification_preferences' })
export class NotificationPreference {
  @Prop({ required: true, unique: true, index: true })
  userId: string; // GitHub username

  @Prop({ required: true })
  email: string;

  @Prop({ type: Object, required: true })
  channels: {
    email: {
      enabled: boolean;
      address: string;
      digestMode: 'real-time' | 'hourly' | 'daily';
      digestTimes?: {
        morning: string; // HH:MM
        evening: string;
      };
    };
    slack_dm: {
      enabled: boolean;
      slackUserId?: string;
    };
    slack_channel: {
      enabled: boolean;
      channelId?: string;
      channelName?: string;
      eventTypesOnly?: string[];
    };
  };

  @Prop({ type: Object, required: true })
  quietHours: {
    enabled: boolean;
    startTime: string; // HH:MM
    endTime: string;
    daysOfWeek: number[]; // 0=Sunday, 6=Saturday
    bypassForUrgent: boolean;
  };

  @Prop({ type: Object, required: true })
  eventPreferences: Record<string, boolean>;

  @Prop({ type: Object, required: true })
  unsubscribed: {
    email: boolean;
    slackDm: boolean;
    slackChannel: boolean;
    unsubscribedAt?: Date;
    reason?: string;
  };

  @Prop({ required: true, unique: true, index: true })
  unsubscribeToken: string;

  @Prop({ default: 'UTC' })
  timezone: string;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(NotificationPreference);
