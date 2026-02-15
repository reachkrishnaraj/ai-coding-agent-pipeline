import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
} from '@nestjs/common';
import { StatsService } from './stats.service';
import { StatsQueryDto } from './dto/stats-query.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';

@Controller('api/stats')
@UseGuards(AuthenticatedGuard)
export class StatsController {
  private readonly logger = new Logger(StatsController.name);

  constructor(private readonly statsService: StatsService) {}

  @Get('overview')
  async getOverview(@Query() query: StatsQueryDto) {
    this.logger.log(`GET /api/stats/overview - query: ${JSON.stringify(query)}`);
    return this.statsService.getMetrics(query);
  }

  @Get('by-status')
  async getByStatus(@Query() query: StatsQueryDto) {
    this.logger.log(`GET /api/stats/by-status`);
    const metrics = await this.statsService.getMetrics(query);
    return {
      byStatus: metrics.breakdown.byStatus,
      period: metrics.period,
    };
  }

  @Get('by-repo')
  async getByRepo(@Query() query: StatsQueryDto) {
    this.logger.log(`GET /api/stats/by-repo`);
    const metrics = await this.statsService.getMetrics(query);
    return {
      byRepo: metrics.breakdown.byRepo,
      period: metrics.period,
    };
  }

  @Get('trends')
  async getTrends(@Query() query: StatsQueryDto) {
    this.logger.log(`GET /api/stats/trends`);
    return this.statsService.getDailyVolume(query);
  }

  @Get('by-user')
  async getByUser(
    @Query() query: StatsQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`GET /api/stats/by-user - page: ${page}, limit: ${limit}`);
    return this.statsService.getUserActivity(query, page, limit);
  }

  @Get('agent-performance')
  async getAgentPerformance(@Query() query: StatsQueryDto) {
    this.logger.log(`GET /api/stats/agent-performance`);
    return this.statsService.getAgentPerformance(query);
  }

  @Get('failures')
  async getFailures(
    @Query() query: StatsQueryDto,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`GET /api/stats/failures - page: ${page}, limit: ${limit}`);
    return this.statsService.getFailures(query, page, limit);
  }
}
