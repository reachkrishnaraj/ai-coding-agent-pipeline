import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export type UserRole = 'admin' | 'developer';
export type UserStatus = 'pending' | 'active' | 'inactive';

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true })
  githubId: string;

  @Prop({ required: true, unique: true, index: true })
  username: string;

  @Prop()
  displayName: string;

  @Prop()
  email: string;

  @Prop()
  avatarUrl: string;

  @Prop({ required: true, default: 'developer', index: true })
  role: UserRole;

  @Prop({ required: true, default: 'pending', index: true })
  status: UserStatus;

  @Prop()
  lastLoginAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Virtual for id
UserSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret: Record<string, any>) => {
    ret.id = ret._id?.toString();
    ret._id = undefined;
    ret.__v = undefined;
    return ret;
  },
});
