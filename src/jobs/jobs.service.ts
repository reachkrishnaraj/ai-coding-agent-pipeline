import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection } from 'mongoose';
import { Agenda, Job } from 'agenda';
import { Task } from '../common/schemas/task.schema';
import { JobHistory } from '../common/schemas/job-history.schema';
import { AnalyticsDaily } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly } from '../common/schemas/analytics-weekly.schema';
import { TaskStatus } from '../common/enums/task-status.enum';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private agenda: Agenda;

  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(JobHistory.name) private jobHistoryModel: Model<JobHistory>,
    @InjectModel(AnalyticsDaily.name) private analyticsDailyModel: Model<AnalyticsDaily>,
    @InjectModel(AnalyticsWeekly.name) private analyticsWeeklyModel: Model<AnalyticsWeekly>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const mongoUri = this.configService.get<string>('MONGODB_URI');
    const jobWorkersEnabled = this.configService.get<string>('JOB_WORKERS_ENABLED') !== 'false';

    this.agenda = new Agenda({
      mongo: this.connection.db,
      db: { collection: 'agenda_jobs' },
      processEvery: '30 seconds',
      maxConcurrency: 10,
    });

    // Define all jobs
    this.defineJobs();

    // Set up event listeners
    this.setupEventListeners();

    await this.agenda.start();
    this.logger.log('Agenda started successfully');

    if (jobWorkersEnabled) {
      await this.scheduleAllJobs();
      this.logger.log('All jobs scheduled successfully');
    } else {
      this.logger.log('Job workers disabled via config');
    }
  }

  async onModuleDestroy() {
    if (this.agenda) {
      await this.agenda.stop();
      this.logger.log('Agenda stopped');
    }
  }

  private defineJobs() {
    // Session Cleanup Job
    this.agenda.define('session-cleanup', async (job: Job) => {
      await this.sessionCleanupJob(job);
    }, { concurrency: 1 });

    // Stale Task Cleanup Job
    this.agenda.define('stale-task-cleanup', async (job: Job) => {
      await this.staleTaskCleanupJob(job);
    }, { concurrency: 1 });

    // PR Status Sync Job
    this.agenda.define('pr-status-sync', async (job: Job) => {
      await this.prStatusSyncJob(job);
    }, { concurrency: 5 });

    // Retry Failed Tasks Job
    this.agenda.define('retry-failed-tasks', async (job: Job) => {
      await this.retryFailedTasksJob(job);
    }, { concurrency: 3 });

    // Daily Analytics Job
    this.agenda.define('daily-analytics', async (job: Job) => {
      await this.dailyAnalyticsJob(job);
    }, { concurrency: 1 });

    // Weekly Analytics Job
    this.agenda.define('weekly-analytics', async (job: Job) => {
      await this.weeklyAnalyticsJob(job);
    }, { concurrency: 1 });
  }

  private setupEventListeners() {
    this.agenda.on('start', (job) => {
      this.logger.log(`Job ${job.attrs.name} starting`);
    });

    this.agenda.on('complete', (job) => {
      this.logger.log(`Job ${job.attrs.name} completed`);
    });

    this.agenda.on('fail', (err, job) => {
      this.logger.error(`Job ${job.attrs.name} failed: ${err.message}`, err.stack);
    });
  }

  private async scheduleAllJobs() {
    // Session cleanup: daily at 4 AM UTC
    await this.agenda.every('0 4 * * *', 'session-cleanup', {}, { timezone: 'UTC' });

    // Stale task cleanup: daily at 2 AM UTC
    await this.agenda.every('0 2 * * *', 'stale-task-cleanup', {}, { timezone: 'UTC' });

    // PR status sync: every 10 minutes
    await this.agenda.every('10 minutes', 'pr-status-sync');

    // Retry failed tasks: every 30 minutes
    await this.agenda.every('30 minutes', 'retry-failed-tasks');

    // Daily analytics: daily at 3 AM UTC
    await this.agenda.every('0 3 * * *', 'daily-analytics', {}, { timezone: 'UTC' });

    // Weekly analytics: weekly at 3 AM UTC on Sunday
    await this.agenda.every('0 3 * * 0', 'weekly-analytics', {}, { timezone: 'UTC' });
  }

  // Job Implementations

  private async sessionCleanupJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'session-cleanup';

    try {
      this.logger.log('Starting session cleanup job');

      // Delete expired sessions
      if (!this.connection.db) {
        throw new Error('Database connection not available');
      }
      const sessionsCollection = this.connection.db.collection('sessions');
      const result = await sessionsCollection.deleteMany({
        expires: { $lt: new Date() }
      });

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        sessionsDeleted: result.deletedCount,
        durationMs
      });

      this.logger.log(`Session cleanup completed: ${result.deletedCount} sessions deleted`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  private async staleTaskCleanupJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'stale-task-cleanup';

    try {
      this.logger.log('Starting stale task cleanup job');

      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const staleTasks = await this.taskModel.find({
        status: {
          $in: [
            TaskStatus.ANALYZING,
            TaskStatus.NEEDS_CLARIFICATION,
            TaskStatus.DISPATCHED
          ]
        },
        updatedAt: { $lt: twentyFourHoursAgo }
      });

      let tasksProcessed = 0;
      let tasksUpdated = 0;
      const errors: string[] = [];

      for (const task of staleTasks) {
        tasksProcessed++;
        try {
          // Log a warning event
          task.events.push({
            eventType: 'stale_task_detected',
            payload: {
              currentStatus: task.status,
              lastUpdated: task.updatedAt,
              staleForHours: Math.floor((Date.now() - task.updatedAt.getTime()) / (1000 * 60 * 60))
            },
            createdAt: new Date(),
          });

          // For now, just mark tasks as needing escalation
          // In a full implementation, this would check GitHub status
          task.status = TaskStatus.FAILED;
          task.errorMessage = 'Task stale - exceeded 24 hour processing time';

          await task.save();
          tasksUpdated++;
        } catch (error) {
          errors.push(`Task ${task._id}: ${error.message}`);
        }
      }

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        tasksProcessed,
        tasksUpdated,
        errors,
        durationMs
      });

      this.logger.log(`Stale task cleanup completed: ${tasksUpdated}/${tasksProcessed} tasks updated`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  private async prStatusSyncJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'pr-status-sync';

    try {
      this.logger.log('Starting PR status sync job');

      const openPrTasks = await this.taskModel.find({
        status: TaskStatus.PR_OPEN,
        githubPrNumber: { $exists: true }
      });

      let tasksProcessed = 0;
      let tasksUpdated = 0;
      const errors: string[] = [];

      // In a full implementation, this would call GitHub API
      // For now, we just log the tasks that would be synced
      for (const task of openPrTasks) {
        tasksProcessed++;
        // TODO: Implement GitHub API integration
        // await this.githubService.getPrStatus(task.repo, task.githubPrNumber);
      }

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        tasksProcessed,
        tasksUpdated,
        errors,
        durationMs
      });

      this.logger.log(`PR status sync completed: ${tasksProcessed} PRs checked`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  private async retryFailedTasksJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'retry-failed-tasks';

    try {
      this.logger.log('Starting retry failed tasks job');

      // Find failed tasks that haven't exceeded max retries
      const failedTasks = await this.taskModel.find({
        status: TaskStatus.FAILED,
        $or: [
          { retryCount: { $exists: false } },
          { retryCount: { $lt: 3 } }
        ]
      });

      let tasksProcessed = 0;
      let tasksRetried = 0;
      const errors: string[] = [];

      for (const task of failedTasks) {
        tasksProcessed++;
        try {
          const retryCount = (task['retryCount'] || 0) + 1;

          // Check if error is retryable
          if (task.errorMessage && this.isRetryableError(task.errorMessage)) {
            // Reset status to allow reprocessing
            task.status = TaskStatus.RECEIVED;
            task['retryCount'] = retryCount;

            task.events.push({
              eventType: 'task_retry_scheduled',
              payload: {
                retryCount,
                previousError: task.errorMessage
              },
              createdAt: new Date(),
            });

            await task.save();
            tasksRetried++;
          }
        } catch (error) {
          errors.push(`Task ${task._id}: ${error.message}`);
        }
      }

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        tasksProcessed,
        tasksRetried,
        errors,
        durationMs
      });

      this.logger.log(`Retry failed tasks completed: ${tasksRetried}/${tasksProcessed} tasks retried`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  private async dailyAnalyticsJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'daily-analytics';

    try {
      this.logger.log('Starting daily analytics job');

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Aggregate tasks from the past 24 hours
      const tasks = await this.taskModel.find({
        createdAt: { $gte: yesterday, $lt: today }
      });

      const tasksCreated = tasks.length;
      const tasksCompleted = tasks.filter(t => t.status === TaskStatus.MERGED).length;
      const tasksFailed = tasks.filter(t => t.status === TaskStatus.FAILED).length;

      // Calculate average time to merge
      const mergedTasks = tasks.filter(t => t.completedAt && t.createdAt);
      const avgTimeToMerge = mergedTasks.length > 0
        ? mergedTasks.reduce((sum, t) => {
            const timeToMerge = (t.completedAt.getTime() - t.createdAt.getTime()) / (1000 * 60);
            return sum + timeToMerge;
          }, 0) / mergedTasks.length
        : 0;

      // Task type breakdown
      const taskTypeBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        const type = t.taskType || 'unknown';
        taskTypeBreakdown[type] = (taskTypeBreakdown[type] || 0) + 1;
      });

      // Repo breakdown
      const repoBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        repoBreakdown[t.repo] = (repoBreakdown[t.repo] || 0) + 1;
      });

      // Agent breakdown
      const agentBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        const agent = t.recommendedAgent || 'unknown';
        agentBreakdown[agent] = (agentBreakdown[agent] || 0) + 1;
      });

      // Calculate failure rate
      const failureRate = tasksCreated > 0 ? (tasksFailed / tasksCreated) * 100 : 0;

      // Upsert analytics document
      await this.analyticsDailyModel.updateOne(
        { date: yesterday },
        {
          $set: {
            tasksCreated,
            tasksCompleted,
            tasksFailed,
            avgTimeToMerge,
            taskTypeBreakdown,
            repoBreakdown,
            agentBreakdown,
            failureRate
          }
        },
        { upsert: true }
      );

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        date: yesterday.toISOString(),
        tasksCreated,
        tasksCompleted,
        tasksFailed,
        durationMs
      });

      this.logger.log(`Daily analytics completed: ${tasksCreated} tasks analyzed`);

      // Alert if failure rate is too high
      if (failureRate > 5) {
        this.logger.warn(`High failure rate detected: ${failureRate.toFixed(2)}%`);
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  private async weeklyAnalyticsJob(job: Job) {
    const startTime = Date.now();
    const jobName = 'weekly-analytics';

    try {
      this.logger.log('Starting weekly analytics job');

      // Get the start of the current week (Monday)
      const today = new Date();
      const dayOfWeek = today.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const weekStart = new Date(today);
      weekStart.setUTCDate(today.getUTCDate() - daysToMonday - 7); // Previous week
      weekStart.setUTCHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 7);

      // Aggregate tasks from the past week
      const tasks = await this.taskModel.find({
        createdAt: { $gte: weekStart, $lt: weekEnd }
      });

      const tasksCreated = tasks.length;
      const tasksCompleted = tasks.filter(t => t.status === TaskStatus.MERGED).length;
      const tasksFailed = tasks.filter(t => t.status === TaskStatus.FAILED).length;

      // Calculate average time to merge
      const mergedTasks = tasks.filter(t => t.completedAt && t.createdAt);
      const avgTimeToMerge = mergedTasks.length > 0
        ? mergedTasks.reduce((sum, t) => {
            const timeToMerge = (t.completedAt.getTime() - t.createdAt.getTime()) / (1000 * 60);
            return sum + timeToMerge;
          }, 0) / mergedTasks.length
        : 0;

      // Task type breakdown
      const taskTypeBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        const type = t.taskType || 'unknown';
        taskTypeBreakdown[type] = (taskTypeBreakdown[type] || 0) + 1;
      });

      // Repo breakdown
      const repoBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        repoBreakdown[t.repo] = (repoBreakdown[t.repo] || 0) + 1;
      });

      // Agent breakdown
      const agentBreakdown: Record<string, number> = {};
      tasks.forEach(t => {
        const agent = t.recommendedAgent || 'unknown';
        agentBreakdown[agent] = (agentBreakdown[agent] || 0) + 1;
      });

      // Calculate failure rate
      const failureRate = tasksCreated > 0 ? (tasksFailed / tasksCreated) * 100 : 0;

      // Calculate week-over-week trends
      const previousWeekStart = new Date(weekStart);
      previousWeekStart.setUTCDate(weekStart.getUTCDate() - 7);
      const previousWeekEnd = new Date(weekStart);

      const previousWeekAnalytics = await this.analyticsWeeklyModel.findOne({
        weekStart: previousWeekStart
      });

      let weekOverWeekTrend;
      if (previousWeekAnalytics) {
        weekOverWeekTrend = {
          tasksCreatedChange: this.calculatePercentageChange(
            previousWeekAnalytics.tasksCreated,
            tasksCreated
          ),
          completionRateChange: this.calculatePercentageChange(
            previousWeekAnalytics.tasksCompleted,
            tasksCompleted
          ),
          avgTimeToMergeChange: this.calculatePercentageChange(
            previousWeekAnalytics.avgTimeToMerge,
            avgTimeToMerge
          ),
        };
      }

      // Upsert analytics document
      await this.analyticsWeeklyModel.updateOne(
        { weekStart },
        {
          $set: {
            weekEnd,
            tasksCreated,
            tasksCompleted,
            tasksFailed,
            avgTimeToMerge,
            taskTypeBreakdown,
            repoBreakdown,
            agentBreakdown,
            failureRate,
            weekOverWeekTrend
          }
        },
        { upsert: true }
      );

      const durationMs = Date.now() - startTime;

      await this.recordJobSuccess(job, {
        weekStart: weekStart.toISOString(),
        tasksCreated,
        tasksCompleted,
        tasksFailed,
        durationMs
      });

      this.logger.log(`Weekly analytics completed: ${tasksCreated} tasks analyzed`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      await this.recordJobFailure(job, error, durationMs);
      throw error;
    }
  }

  // Helper Methods

  private isRetryableError(errorMessage: string): boolean {
    const retryableErrors = [
      'LLM_API_ERROR',
      'RATE_LIMITED',
      'GITHUB_API_ERROR',
      'TRANSIENT_ERROR',
      'timeout',
      'network',
      'connection'
    ];

    return retryableErrors.some(err =>
      errorMessage.toLowerCase().includes(err.toLowerCase())
    );
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }

  private async recordJobSuccess(job: Job, result: any) {
    try {
      await this.jobHistoryModel.create({
        jobName: job.attrs.name,
        jobId: job.attrs._id?.toString() || 'unknown',
        status: 'completed',
        startedAt: job.attrs.lastRunAt || new Date(),
        completedAt: new Date(),
        durationMs: result.durationMs || 0,
        result,
        retryCount: job.attrs.failCount || 0,
        progress: 100,
        logs: []
      });
    } catch (error) {
      this.logger.error(`Failed to record job success: ${error.message}`);
    }
  }

  private async recordJobFailure(job: Job, error: any, durationMs: number) {
    try {
      await this.jobHistoryModel.create({
        jobName: job.attrs.name,
        jobId: job.attrs._id?.toString() || 'unknown',
        status: 'failed',
        startedAt: job.attrs.lastRunAt || new Date(),
        completedAt: new Date(),
        durationMs,
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code || 'UNKNOWN_ERROR'
        },
        retryCount: job.attrs.failCount || 0,
        progress: 0,
        logs: []
      });
    } catch (err) {
      this.logger.error(`Failed to record job failure: ${err.message}`);
    }
  }

  // Public API for manual job triggering

  async runJobNow(jobName: string): Promise<Job> {
    this.logger.log(`Manually triggering job: ${jobName}`);
    const job = await this.agenda.now(jobName);
    return job;
  }

  async getJobs(limit: number = 50, status?: string) {
    const query: any = {};

    if (status) {
      query.status = status;
    }

    const jobs = await this.jobHistoryModel
      .find(query)
      .sort({ completedAt: -1 })
      .limit(limit)
      .exec();

    return jobs;
  }

  async getJobById(jobId: string) {
    return this.jobHistoryModel.findById(jobId).exec();
  }

  getAgenda(): Agenda {
    return this.agenda;
  }
}
