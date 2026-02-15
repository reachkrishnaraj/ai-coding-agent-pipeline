import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { Task, TaskSchema } from '../common/schemas/task.schema';
import { JobHistory, JobHistorySchema } from '../common/schemas/job-history.schema';
import { AnalyticsDaily, AnalyticsDailySchema } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly, AnalyticsWeeklySchema } from '../common/schemas/analytics-weekly.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: JobHistory.name, schema: JobHistorySchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: AnalyticsWeekly.name, schema: AnalyticsWeeklySchema },
    ]),
  ],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
