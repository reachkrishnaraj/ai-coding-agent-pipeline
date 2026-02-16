import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { AddDependencyDto } from './dto/add-dependency.dto';

@Controller('api/tasks/:taskId/dependencies')
export class DependenciesController {
  constructor(private readonly dependenciesService: DependenciesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addDependency(
    @Param('taskId') taskId: string,
    @Body() dto: AddDependencyDto,
  ) {
    const task = await this.dependenciesService.addDependency(taskId, dto) as any;
    return {
      id: task._id.toString(),
      status: task.status,
      dependencyStatus: task.dependencyStatus,
      dependencies: task.dependencies,
    };
  }

  @Delete(':dependencyId')
  @HttpCode(HttpStatus.OK)
  async removeDependency(
    @Param('taskId') taskId: string,
    @Param('dependencyId') dependencyId: string,
  ) {
    const task = await this.dependenciesService.removeDependency(taskId, dependencyId) as any;
    return {
      id: task._id.toString(),
      dependencies: task.dependencies,
    };
  }

  @Get()
  async getDependencies(@Param('taskId') taskId: string) {
    return this.dependenciesService.getDependencies(taskId);
  }

  @Get('dependents')
  async getDependents(@Param('taskId') taskId: string) {
    const dependents = await this.dependenciesService.getDependents(taskId);
    return {
      taskId,
      dependents: dependents.map((t: any) => ({
        id: t._id.toString(),
        title: t.llmSummary || t.description.substring(0, 100),
        status: t.status,
        dependencyStatus: t.dependencyStatus,
      })),
    };
  }
}
