import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JobHistoryDocument = JobHistory & Document;

@Schema({ timestamps: true, collection: 'job_history' })
export class JobHistory {
  @Prop({ required: true, index: true })
  jobName: string;

  @Prop({ required: true })
  jobId: string;

  @Prop({
    required: true,
    enum: ['pending', 'active', 'completed', 'failed'],
    index: true
  })
  status: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  durationMs?: number;

  @Prop({ type: Object })
  result?: {
    tasksProcessed?: number;
    tasksUpdated?: number;
    sessionsDeleted?: number;
    errors?: string[];
    [key: string]: any;
  };

  @Prop({ type: Object })
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };

  @Prop({ default: 0 })
  retryCount: number;

  @Prop()
  nextRetryAt?: Date;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  @Prop({
    type: [
      {
        level: { type: String, enum: ['info', 'warn', 'error'] },
        timestamp: { type: Date, default: Date.now },
        message: String,
        context: Object,
      },
    ],
  })
  logs: Array<{
    level: 'info' | 'warn' | 'error';
    timestamp: Date;
    message: string;
    context?: Record<string, any>;
  }>;
}

export const JobHistorySchema = SchemaFactory.createForClass(JobHistory);

// Indexes
JobHistorySchema.index({ jobName: 1, completedAt: -1 });
JobHistorySchema.index({ status: 1, completedAt: -1 });
JobHistorySchema.index({ completedAt: -1 });

// TTL index - auto-delete after 90 days
JobHistorySchema.index({ completedAt: 1 }, { expireAfterSeconds: 7776000 });

// Virtual for id
JobHistorySchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
