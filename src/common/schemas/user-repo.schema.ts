import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserRepoDocument = UserRepo & Document;

@Schema({ timestamps: true, collection: 'user-repos' })
export class UserRepo {
  @Prop({ required: true, index: true })
  userId: string; // User's GitHub username

  @Prop({ required: true, index: true })
  repoName: string; // e.g., "mothership/finance-service"

  @Prop()
  repoFullName?: string; // GitHub full_name (may differ from repoName)

  @Prop()
  defaultAgent?: string; // 'claude-code' | 'codex' | 'copilot'

  @Prop()
  customSystemPrompt?: string; // Custom .ai/prompts/system.md content

  @Prop({ default: true })
  isActive: boolean; // Soft delete — false means removed from dashboard

  @Prop()
  addedAt: Date;

  @Prop()
  removedAt?: Date;

  // Cached metadata
  @Prop()
  repoDescription?: string;

  @Prop()
  repoUrl?: string;

  @Prop({ default: false })
  isPrivate: boolean;

  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserRepoSchema = SchemaFactory.createForClass(UserRepo);

// Indexes
UserRepoSchema.index({ userId: 1, isActive: 1 }); // Find user's active repos
UserRepoSchema.index({ repoName: 1 }); // Find a specific repo
UserRepoSchema.index({ userId: 1, repoName: 1 }, { unique: true }); // Prevent duplicates

// Virtual for id
UserRepoSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
