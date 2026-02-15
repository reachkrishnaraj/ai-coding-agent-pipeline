import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { AuthGuard } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';

@Controller('api/tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto, @Req() req: Request) {
    const user = req.user as SessionUser;
    // Set the creator to current user
    return this.tasksService.create({
      ...createTaskDto,
      createdBy: user.username,
    });
  }

  @Post(':id/clarify')
  @HttpCode(HttpStatus.OK)
  async clarify(
    @Param('id') id: string,
    @Body() clarifyDto: ClarifyTaskDto,
    @Req() req: Request,
  ) {
    await this.checkOwnership(id, req);
    return this.tasksService.clarify(id, clarifyDto);
  }

  @Get()
  async findAll(@Query() query: TaskQueryDto, @Req() req: Request) {
    const user = req.user as SessionUser;

    // If user is developer, filter by their username
    if (user.role === 'developer') {
      return this.tasksService.findAll({
        ...query,
        createdBy: user.username,
      });
    }

    // Admins see all tasks
    return this.tasksService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const task = await this.tasksService.findOne(id);
    const user = req.user as SessionUser;

    // Check ownership for non-admins
    if (user.role !== 'admin' && task.createdBy !== user.username) {
      throw new ForbiddenException('You can only view your own tasks');
    }

    return task;
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Param('id') id: string, @Req() req: Request) {
    await this.checkOwnership(id, req);
    return this.tasksService.retry(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string, @Req() req: Request) {
    await this.checkOwnership(id, req);
    return this.tasksService.cancel(id);
  }

  /**
   * Check if user owns the task (or is admin)
   */
  private async checkOwnership(taskId: string, req: Request): Promise<void> {
    const user = req.user as SessionUser;

    // Admins can do anything
    if (user.role === 'admin') {
      return;
    }

    const task = await this.tasksService.findOne(taskId);
    if (task.createdBy !== user.username) {
      throw new ForbiddenException('You can only modify your own tasks');
    }
  }
}
