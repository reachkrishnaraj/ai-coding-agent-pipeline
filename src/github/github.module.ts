import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GitHubIssuesService } from './github-issues.service';
import { GitHubWebhookController } from './github-webhook.controller';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    SlackModule,
  ],
  controllers: [GitHubWebhookController],
  providers: [GitHubIssuesService],
  exports: [GitHubIssuesService],
})
export class GitHubModule {}
