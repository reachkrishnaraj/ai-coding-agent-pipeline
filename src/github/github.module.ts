import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GitHubIssuesService } from './github-issues.service';
import { GitHubWebhookController } from './github-webhook.controller';

@Module({
  imports: [ConfigModule],
  controllers: [GitHubWebhookController],
  providers: [GitHubIssuesService],
  exports: [GitHubIssuesService],
})
export class GitHubModule {}
