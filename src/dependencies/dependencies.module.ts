import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';
import { Task, TaskSchema } from '../common/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
  controllers: [DependenciesController],
  providers: [DependenciesService],
  exports: [DependenciesService],
})
export class DependenciesModule {}
