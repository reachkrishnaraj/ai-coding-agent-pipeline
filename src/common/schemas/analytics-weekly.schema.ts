import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalyticsWeeklyDocument = AnalyticsWeekly & Document;

@Schema({ timestamps: true, collection: 'analytics_weekly' })
export class AnalyticsWeekly {
  @Prop({ required: true, unique: true, index: true })
  weekStart: Date; // Monday of week at midnight UTC

  @Prop({ required: true })
  weekEnd: Date;

  @Prop({ required: true, default: 0 })
  tasksCreated: number;

  @Prop({ required: true, default: 0 })
  tasksCompleted: number;

  @Prop({ required: true, default: 0 })
  tasksFailed: number;

  @Prop({ default: 0 })
  avgTimeToMerge: number; // in minutes

  @Prop({ default: 0 })
  avgLlmAnalysisTime: number; // in seconds

  @Prop({ type: Object, default: {} })
  taskTypeBreakdown: Record<string, number>;

  @Prop({ type: Object, default: {} })
  repoBreakdown: {
    [repoName: string]: number;
  };

  @Prop({ type: Object, default: {} })
  agentBreakdown: {
    [agentName: string]: number;
  };

  @Prop({ default: 0, min: 0, max: 100 })
  failureRate: number; // percentage 0-100

  @Prop({ type: Object })
  weekOverWeekTrend?: {
    tasksCreatedChange: number; // percentage
    completionRateChange: number;
    avgTimeToMergeChange: number;
  };
}

export const AnalyticsWeeklySchema = SchemaFactory.createForClass(AnalyticsWeekly);

// Indexes
AnalyticsWeeklySchema.index({ weekStart: -1 });

// Virtual for id
AnalyticsWeeklySchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
