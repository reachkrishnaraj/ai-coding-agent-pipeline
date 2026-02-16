import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalyticsDailyDocument = AnalyticsDaily & Document;

@Schema({ timestamps: true, collection: 'analytics_daily' })
export class AnalyticsDaily {
  @Prop({ required: true, unique: true, index: true })
  date: Date; // Date at midnight UTC

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
}

export const AnalyticsDailySchema = SchemaFactory.createForClass(AnalyticsDaily);

// Indexes
AnalyticsDailySchema.index({ date: -1 });

// Virtual for id
AnalyticsDailySchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
