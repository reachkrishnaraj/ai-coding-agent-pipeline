import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { AnalyticsDaily, AnalyticsDailySchema } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly, AnalyticsWeeklySchema } from '../common/schemas/analytics-weekly.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: AnalyticsWeekly.name, schema: AnalyticsWeeklySchema },
    ]),
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
