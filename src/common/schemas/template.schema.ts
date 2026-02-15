import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TemplateDocument = TaskTemplate & Document;

export interface TemplateVariable {
  label: string;
  description: string;
  example: string;
  required: boolean;
  type?: 'text' | 'select' | 'multiline' | 'array' | 'url';
  options?: string[];
  defaultValue?: string;
  placeholder?: string;
  helpText?: string;
}

@Schema({ timestamps: true, collection: 'templates' })
export class TaskTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    required: true,
    enum: ['builtin', 'custom', 'global'],
    index: true,
  })
  templateType: string;

  @Prop({ index: true })
  ownerId?: string; // GitHub username or user ID

  @Prop()
  organizationId?: string;

  @Prop({ default: false })
  isReadOnly: boolean;

  @Prop()
  defaultRepo?: string;

  @Prop()
  defaultTaskType?: string;

  @Prop()
  defaultPriority?: string;

  @Prop({ required: true })
  descriptionTemplate: string;

  @Prop({ type: [String] })
  filesHintTemplate?: string[];

  @Prop({ type: [String] })
  acceptanceCriteriaTemplate?: string[];

  @Prop({ type: Object, required: true })
  variables: Record<string, TemplateVariable>;

  @Prop({
    default: 'private',
    enum: ['private', 'organization', 'public'],
    index: true,
  })
  visibility: string;

  @Prop({ type: [String] })
  allowedUsers?: string[];

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ default: 0 })
  favoriteCount: number;

  @Prop()
  icon?: string;

  @Prop({ index: true })
  category?: string;

  @Prop({ type: [String] })
  tags?: string[];

  @Prop()
  estimatedTimeMinutes?: number;

  @Prop({ required: true })
  createdBy: string;
}

export const TemplateSchema = SchemaFactory.createForClass(TaskTemplate);

// Indexes
TemplateSchema.index({ templateType: 1 });
TemplateSchema.index({ ownerId: 1 });
TemplateSchema.index({ defaultRepo: 1 });
TemplateSchema.index({ name: 1, ownerId: 1 });
TemplateSchema.index({ visibility: 1 });
TemplateSchema.index({ createdAt: -1 });
TemplateSchema.index({ usageCount: -1 });

// Virtual for id
TemplateSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
