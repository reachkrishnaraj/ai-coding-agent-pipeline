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
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';

@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Post(':id/clarify')
  @HttpCode(HttpStatus.OK)
  async clarify(@Param('id') id: string, @Body() clarifyDto: ClarifyTaskDto) {
    return this.tasksService.clarify(id, clarifyDto);
  }

  @Get()
  async findAll(@Query() query: TaskQueryDto) {
    return this.tasksService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.OK)
  async retry(@Param('id') id: string) {
    return this.tasksService.retry(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    return this.tasksService.cancel(id);
  }
}
