import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GitHubIssuesService } from './github-issues.service';
import { GitHubWebhookController } from './github-webhook.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';

@Module({
  imports: [ConfigModule, PrismaModule, SlackModule],
  controllers: [GitHubWebhookController],
  providers: [GitHubIssuesService],
  exports: [GitHubIssuesService],
})
export class GitHubModule {}
