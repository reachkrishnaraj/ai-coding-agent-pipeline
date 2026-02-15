import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { TaskStatus } from '../enums/task-status.enum';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  // Source
  @Prop({ required: true })
  source: string; // 'web' | 'slack' | 'api' | 'asana'

  @Prop({ required: true, default: TaskStatus.RECEIVED, index: true })
  status: string;

  // User input
  @Prop({ required: true })
  description: string;

  @Prop()
  taskTypeHint?: string;

  @Prop({ default: 'mothership/finance-service', index: true })
  repo: string;

  @Prop({ type: [String] })
  filesHint?: string[];

  @Prop()
  acceptanceCriteria?: string;

  @Prop({ default: 'normal' })
  priority: string;

  // LLM analysis (flexible — stored as-is from OpenAI)
  @Prop({ type: Object })
  llmAnalysis?: Record<string, any>;

  @Prop()
  llmSummary?: string;

  @Prop()
  taskType?: string;

  @Prop()
  recommendedAgent?: string;

  @Prop({ type: [String] })
  likelyFiles?: string[];

  @Prop({ type: [String] })
  suggestedCriteria?: string[];

  // Clarification
  @Prop({ type: [String] })
  clarificationQuestions?: string[];

  @Prop({ type: [String] })
  clarificationAnswers?: string[];

  @Prop({ default: false })
  isClarified: boolean;

  // GitHub
  @Prop()
  githubIssueNumber?: number;

  @Prop()
  githubIssueUrl?: string;

  @Prop()
  githubPrNumber?: number;

  @Prop()
  githubPrUrl?: string;

  @Prop()
  githubPrStatus?: string;

  @Prop()
  githubBranch?: string;

  // Slack
  @Prop()
  slackUserId?: string;

  @Prop()
  slackChannelId?: string;

  @Prop()
  slackThreadTs?: string;

  // Meta
  @Prop()
  createdBy?: string;

  @Prop()
  dispatchedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  errorMessage?: string;

  // Embedded events (denormalized for fast reads)
  @Prop({
    type: [
      {
        eventType: String,
        payload: Object,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  })
  events: Array<{
    eventType: string;
    payload?: Record<string, any>;
    createdAt: Date;
  }>;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Indexes
TaskSchema.index({ status: 1 });
TaskSchema.index({ repo: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ githubIssueNumber: 1 }, { sparse: true });
TaskSchema.index({ slackThreadTs: 1 }, { sparse: true });

// Virtual for id
TaskSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
