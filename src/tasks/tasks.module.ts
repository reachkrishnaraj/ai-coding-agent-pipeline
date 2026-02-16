import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksController } from './tasks.controller';
import { HealthController } from './health.controller';
import { TasksService } from './tasks.service';
import { TasksGateway } from './tasks.gateway';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { LlmServiceMock } from '../common/mocks/llm.service.mock';
import { GitHubModule } from '../github/github.module';
import { DependenciesModule } from '../dependencies/dependencies.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    GitHubModule,
    forwardRef(() => DependenciesModule),
  ],
  controllers: [TasksController, HealthController],
  providers: [
    TasksService,
    TasksGateway,
    {
      provide: 'ILlmService',
      useClass: LlmServiceMock,
    },
    {
      provide: 'TasksGateway',
      useExisting: TasksGateway,
    },
    // 'IGitHubService' is provided by GitHubModule
  ],
  exports: [TasksService, TasksGateway, MongooseModule],
})
export class TasksModule {}
