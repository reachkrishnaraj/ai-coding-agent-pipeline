import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationLogDocument = NotificationLog & Document;

@Schema({ timestamps: true, collection: 'notification_logs' })
export class NotificationLog {
  @Prop({ index: true })
  taskId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  channel: 'email' | 'slack_dm' | 'slack_channel';

  @Prop({ required: true, index: true })
  eventType: string;

  @Prop({ required: true })
  recipient: string; // email or slack_user_id

  @Prop()
  subject?: string; // For emails

  @Prop({ required: true, index: true })
  status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'unsubscribed';

  @Prop()
  messageId?: string; // SMTP/SendGrid message ID

  @Prop()
  error?: string; // Error message if failed

  @Prop()
  deliveryTimestamp?: Date; // When confirmed delivered

  @Prop()
  openedAt?: Date; // Email opened (from tracking pixel)

  @Prop()
  clickedAt?: Date; // Link clicked

  @Prop({ type: Object })
  metadata: {
    provider?: 'nodemailer' | 'sendgrid' | 'ses' | 'resend' | 'slack';
    attempts?: number;
    lastAttempt?: Date;
  };
}

export const NotificationLogSchema = SchemaFactory.createForClass(NotificationLog);

// Indexes
NotificationLogSchema.index({ taskId: 1, createdAt: -1 });
NotificationLogSchema.index({ userId: 1, createdAt: -1 });
NotificationLogSchema.index({ status: 1, createdAt: -1 });
NotificationLogSchema.index({ channel: 1, status: 1 });
