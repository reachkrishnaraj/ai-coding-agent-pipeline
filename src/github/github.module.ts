import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GitHubIssuesService } from './github-issues.service';
import { GitHubServiceAdapter } from './github.service.adapter';
import { GitHubWebhookController } from './github-webhook.controller';
import { Task, TaskSchema } from '../common/schemas/task.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    forwardRef(() => require('../tasks/tasks.module').TasksModule),
  ],
  controllers: [GitHubWebhookController],
  providers: [
    GitHubIssuesService,
    GitHubServiceAdapter,
    {
      provide: 'IGitHubService',
      useExisting: GitHubServiceAdapter,
    },
  ],
  exports: [GitHubIssuesService, GitHubServiceAdapter, 'IGitHubService'],
})
export class GitHubModule {}
