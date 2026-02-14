import { Controller, Get } from '@nestjs/common';
import { TasksService } from './tasks.service';

@Controller('api/health')
export class HealthController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async check() {
    return this.tasksService.getHealth();
  }
}
