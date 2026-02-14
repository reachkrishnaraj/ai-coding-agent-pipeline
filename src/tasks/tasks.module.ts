import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksController } from './tasks.controller';
import { HealthController } from './health.controller';
import { TasksService } from './tasks.service';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { LlmServiceMock } from '../common/mocks/llm.service.mock';
import { GitHubServiceMock } from '../common/mocks/github.service.mock';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
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
  exports: [TasksService, MongooseModule],
})
export class TasksModule {}
