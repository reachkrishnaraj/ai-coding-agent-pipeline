import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/jobs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async listJobs(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const jobs = await this.jobsService.getJobs(limitNum, status);

    return {
      success: true,
      count: jobs.length,
      jobs: jobs.map(job => ({
        id: job._id?.toString(),
        jobName: job.jobName,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        result: job.result,
        error: job.error,
        retryCount: job.retryCount
      }))
    };
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobsService.getJobById(id);

    if (!job) {
      return {
        success: false,
        error: 'Job not found'
      };
    }

    return {
      success: true,
      job: {
        id: job._id?.toString(),
        jobName: job.jobName,
        jobId: job.jobId,
        status: job.status,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        durationMs: job.durationMs,
        result: job.result,
        error: job.error,
        retryCount: job.retryCount,
        progress: job.progress,
        logs: job.logs
      }
    };
  }

  @Post(':jobName/run')
  async runJob(@Param('jobName') jobName: string) {
    try {
      const job = await this.jobsService.runJobNow(jobName);

      return {
        success: true,
        message: `Job ${jobName} triggered successfully`,
        jobId: job.attrs._id?.toString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  @Get('queues/status')
  async getQueueStatus() {
    const agenda = this.jobsService.getAgenda();

    // Get job counts by status
    const jobs = await agenda.jobs({});

    const statusCounts = {
      active: 0,
      completed: 0,
      failed: 0,
      scheduled: 0,
      total: jobs.length
    };

    jobs.forEach(job => {
      if (job.attrs.lockedAt) {
        statusCounts.active++;
      } else if (job.attrs.failedAt) {
        statusCounts.failed++;
      } else if (job.attrs.lastFinishedAt) {
        statusCounts.completed++;
      } else {
        statusCounts.scheduled++;
      }
    });

    // Get job definitions
    const definitions = [
      'session-cleanup',
      'stale-task-cleanup',
      'pr-status-sync',
      'retry-failed-tasks',
      'daily-analytics',
      'weekly-analytics'
    ];

    const queues = await Promise.all(
      definitions.map(async (name) => {
        const jobsForName = await agenda.jobs({ name });
        const nextRun = jobsForName.find(j => j.attrs.nextRunAt);

        return {
          name,
          activeJobs: jobsForName.filter(j => j.attrs.lockedAt).length,
          failedJobs: jobsForName.filter(j => j.attrs.failedAt).length,
          nextRunAt: nextRun?.attrs.nextRunAt || null,
          lastRunAt: jobsForName[0]?.attrs.lastRunAt || null
        };
      })
    );

    return {
      success: true,
      statusCounts,
      queues
    };
  }
}
