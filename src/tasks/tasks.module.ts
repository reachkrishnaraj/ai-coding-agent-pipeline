import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { HealthController } from './health.controller';
import { TasksService } from './tasks.service';
import { LlmServiceMock } from '../common/mocks/llm.service.mock';
import { GitHubServiceMock } from '../common/mocks/github.service.mock';

@Module({
  controllers: [TasksController, HealthController],
  providers: [
    TasksService,
    {
      provide: 'ILlmService',
      useClass: LlmServiceMock,
    },
    {
      provide: 'IGitHubService',
      useClass: GitHubServiceMock,
    },
  ],
  exports: [TasksService],
})
export class TasksModule {}
