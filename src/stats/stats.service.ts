import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Task } from '../common/schemas/task.schema';
import { AnalyticsDaily } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly } from '../common/schemas/analytics-weekly.schema';
import { TaskStatus } from '../common/enums/task-status.enum';
import { StatsQueryDto, TimeRange } from './dto/stats-query.dto';
import {
  StatsMetrics,
  DailyVolumeData,
  AgentPerformance,
  UserActivity,
  TaskFailure,
} from './interfaces/stats.interface';
import NodeCache from 'node-cache';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);
  private cache: NodeCache;

  constructor(
    @InjectModel(Task.name) private taskModel: Model<Task>,
    @InjectModel(AnalyticsDaily.name) private analyticsDailyModel: Model<AnalyticsDaily>,
    @InjectModel(AnalyticsWeekly.name) private analyticsWeeklyModel: Model<AnalyticsWeekly>,
  ) {
    // Cache with 5 minute TTL by default
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
  }

  async getMetrics(query: StatsQueryDto): Promise<StatsMetrics> {
    const cacheKey = this.getCacheKey('metrics', query);
    const cached = this.cache.get<StatsMetrics>(cacheKey);

    if (cached) {
      this.logger.debug(`Cache hit for metrics: ${cacheKey}`);
      return cached;
    }

    this.logger.debug(`Computing metrics for query: ${JSON.stringify(query)}`);

    const { from, to, label } = this.getDateRange(query.timeRange || TimeRange.SEVEN_DAYS, query.from, query.to);
    const filter = this.buildFilter(query, from, to);

    // Get all tasks for the period
    const tasks = await this.taskModel.find(filter).exec();

    // Volume metrics
    const tasksCreated = tasks.length;
    const tasksDispatched = tasks.filter(t =>
      [TaskStatus.DISPATCHED, TaskStatus.CODING, TaskStatus.PR_OPEN, TaskStatus.MERGED].includes(t.status as TaskStatus)
    ).length;
    const tasksMerged = tasks.filter(t => t.status === TaskStatus.MERGED).length;
    const tasksFailed = tasks.filter(t => t.status === TaskStatus.FAILED).length;
    const tasksInProgress = tasks.filter(t =>
      [TaskStatus.ANALYZING, TaskStatus.DISPATCHED, TaskStatus.CODING, TaskStatus.PR_OPEN].includes(t.status as TaskStatus)
    ).length;

    // Quality metrics
    const totalCompleted = tasksMerged + tasksFailed;
    const successRate = totalCompleted > 0 ? (tasksMerged / totalCompleted) * 100 : 0;
    const failureRate = totalCompleted > 0 ? (tasksFailed / totalCompleted) * 100 : 0;
    const tasksNeedingClarification = tasks.filter(t => t.clarificationQuestions && t.clarificationQuestions.length > 0).length;
    const clarificationRate = tasksCreated > 0 ? (tasksNeedingClarification / tasksCreated) * 100 : 0;

    // Performance metrics
    const performance = this.calculatePerformanceMetrics(tasks);

    // Breakdown metrics
    const breakdown = {
      byStatus: this.groupBy(tasks, 'status'),
      byTaskType: this.groupBy(tasks, 'taskType'),
      byAgent: this.groupBy(tasks, 'recommendedAgent'),
      byRepo: this.groupBy(tasks, 'repo'),
    };

    // Trends (compare with previous period)
    const trends = await this.calculateTrends(query, from, to, {
      completionRate: tasksDispatched > 0 ? (tasksMerged / tasksDispatched) * 100 : 0,
      successRate,
      avgTimeToPr: performance.avgTimeToPr,
    });

    const metrics: StatsMetrics = {
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        label,
      },
      filters: {
        repo: query.repo || 'all',
        agent: query.agent || 'all',
        taskType: query.taskType || 'all',
        status: query.status || 'all',
      },
      volume: {
        tasksCreated,
        tasksDispatched,
        tasksMerged,
        tasksFailed,
        tasksInProgress,
      },
      quality: {
        successRate: parseFloat(successRate.toFixed(1)),
        failureRate: parseFloat(failureRate.toFixed(1)),
        clarificationRate: parseFloat(clarificationRate.toFixed(1)),
      },
      performance,
      breakdown,
      trends,
      cached: false,
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };

    this.cache.set(cacheKey, metrics);
    return metrics;
  }

  async getDailyVolume(query: StatsQueryDto): Promise<{ data: DailyVolumeData[]; period: any }> {
    const cacheKey = this.getCacheKey('daily-volume', query);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached as any;
    }

    const { from, to } = this.getDateRange(query.timeRange || TimeRange.SEVEN_DAYS, query.from, query.to);

    // Use pre-computed daily analytics if available
    const dailyAnalytics = await this.analyticsDailyModel
      .find({
        date: { $gte: from, $lt: to },
      })
      .sort({ date: 1 })
      .exec();

    const data: DailyVolumeData[] = dailyAnalytics.map(d => ({
      date: d.date.toISOString().split('T')[0],
      tasksCreated: d.tasksCreated,
      tasksMerged: d.tasksCompleted,
      tasksFailed: d.tasksFailed,
    }));

    const result = {
      data,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getAgentPerformance(query: StatsQueryDto): Promise<{ agents: AgentPerformance[]; period: any }> {
    const cacheKey = this.getCacheKey('agent-performance', query);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached as any;
    }

    const { from, to } = this.getDateRange(query.timeRange || TimeRange.SEVEN_DAYS, query.from, query.to);
    const filter = this.buildFilter(query, from, to);

    const tasks = await this.taskModel.find(filter).exec();

    // Group by agent
    const agentGroups = new Map<string, Task[]>();
    tasks.forEach(task => {
      const agent = task.recommendedAgent || 'unknown';
      if (!agentGroups.has(agent)) {
        agentGroups.set(agent, []);
      }
      agentGroups.get(agent)!.push(task as Task);
    });

    const agents: AgentPerformance[] = [];
    for (const [agentName, agentTasks] of agentGroups.entries()) {
      const totalTasks = agentTasks.length;
      const mergedCount = agentTasks.filter(t => t.status === TaskStatus.MERGED).length;
      const failedCount = agentTasks.filter(t => t.status === TaskStatus.FAILED).length;
      const successRate = (mergedCount + failedCount) > 0 ? (mergedCount / (mergedCount + failedCount)) * 100 : 0;

      const performance = this.calculatePerformanceMetrics(agentTasks);

      // Task type breakdown
      const taskBreakdown: Record<string, any> = {};
      const typeGroups = new Map<string, Task[]>();
      agentTasks.forEach(task => {
        const type = task.taskType || 'unknown';
        if (!typeGroups.has(type)) {
          typeGroups.set(type, []);
        }
        typeGroups.get(type)!.push(task);
      });

      for (const [type, typeTasks] of typeGroups.entries()) {
        const typeMerged = typeTasks.filter(t => t.status === TaskStatus.MERGED).length;
        const typeFailed = typeTasks.filter(t => t.status === TaskStatus.FAILED).length;
        taskBreakdown[type] = {
          total: typeTasks.length,
          merged: typeMerged,
          successRate: (typeMerged + typeFailed) > 0 ? (typeMerged / (typeMerged + typeFailed)) * 100 : 0,
        };
      }

      agents.push({
        name: agentName,
        totalTasks,
        mergedCount,
        failedCount,
        successRate: parseFloat(successRate.toFixed(1)),
        avgTimeToPr: performance.avgTimeToPr,
        avgTimeToMerge: performance.avgTimeToMerge,
        taskBreakdown,
      });
    }

    // Sort by success rate descending
    agents.sort((a, b) => b.successRate - a.successRate);

    const result = {
      agents,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async getUserActivity(
    query: StatsQueryDto,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: UserActivity[]; pagination: any; period: any }> {
    const { from, to } = this.getDateRange(query.timeRange || TimeRange.SEVEN_DAYS, query.from, query.to);
    const filter = this.buildFilter(query, from, to);
    filter.createdBy = { $exists: true, $ne: null };

    const tasks = await this.taskModel.find(filter).exec();

    // Group by user
    const userGroups = new Map<string, Task[]>();
    tasks.forEach(task => {
      const userId = task.createdBy || 'unknown';
      if (!userGroups.has(userId)) {
        userGroups.set(userId, []);
      }
      userGroups.get(userId)!.push(task as Task);
    });

    const users: UserActivity[] = [];
    for (const [userId, userTasks] of userGroups.entries()) {
      const tasksCreated = userTasks.length;
      const tasksMerged = userTasks.filter(t => t.status === TaskStatus.MERGED).length;
      const tasksFailed = userTasks.filter(t => t.status === TaskStatus.FAILED).length;
      const successRate = (tasksMerged + tasksFailed) > 0 ? (tasksMerged / (tasksMerged + tasksFailed)) * 100 : 0;

      const performance = this.calculatePerformanceMetrics(userTasks);

      const agentDistribution: Record<string, number> = {};
      userTasks.forEach(task => {
        const agent = task.recommendedAgent || 'unknown';
        agentDistribution[agent] = (agentDistribution[agent] || 0) + 1;
      });

      users.push({
        userId,
        tasksCreated,
        tasksMerged,
        tasksFailed,
        successRate: parseFloat(successRate.toFixed(1)),
        avgTimeToPr: performance.avgTimeToPr,
        agentDistribution,
      });
    }

    // Sort by tasks created descending
    users.sort((a, b) => b.tasksCreated - a.tasksCreated);

    // Paginate
    const total = users.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = users.slice(startIndex, endIndex);

    return {
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        total,
        hasMore: endIndex < total,
      },
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  }

  async getFailures(
    query: StatsQueryDto,
    page: number = 1,
    limit: number = 10
  ): Promise<{ failures: TaskFailure[]; pagination: any }> {
    const { from, to } = this.getDateRange(query.timeRange || TimeRange.SEVEN_DAYS, query.from, query.to);
    const filter = this.buildFilter(query, from, to);
    filter.status = TaskStatus.FAILED;

    const total = await this.taskModel.countDocuments(filter);
    const tasks = await this.taskModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();

    const failures: TaskFailure[] = tasks.map(task => ({
      taskId: task._id.toString(),
      description: task.description.substring(0, 100) + (task.description.length > 100 ? '...' : ''),
      failureReason: task.failureReason || 'Unknown',
      failedAt: task.updatedAt?.toISOString() || task.createdAt?.toISOString() || '',
      status: task.status,
      errorMessage: task.errorMessage || 'No error message',
      githubIssueUrl: task.githubIssueUrl,
    }));

    return {
      failures,
      pagination: {
        page,
        limit,
        total,
        hasMore: (page * limit) < total,
      },
    };
  }

  invalidateCache(pattern?: string) {
    if (pattern) {
      const keys = this.cache.keys().filter(k => k.includes(pattern));
      keys.forEach(k => this.cache.del(k));
      this.logger.debug(`Invalidated ${keys.length} cache keys matching pattern: ${pattern}`);
    } else {
      this.cache.flushAll();
      this.logger.debug('Invalidated all cache');
    }
  }

  // Helper methods

  private getCacheKey(type: string, query: StatsQueryDto): string {
    return `stats:${type}:${query.repo}:${query.agent}:${query.timeRange}:${query.from || ''}:${query.to || ''}`;
  }

  private getDateRange(timeRange: TimeRange, from?: string, to?: string): { from: Date; to: Date; label: string } {
    const now = new Date();
    let fromDate: Date;
    let toDate = new Date(now);
    let label: string;

    switch (timeRange) {
      case TimeRange.TODAY:
        fromDate = new Date(now);
        fromDate.setHours(0, 0, 0, 0);
        label = 'Today';
        break;
      case TimeRange.SEVEN_DAYS:
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 7);
        label = 'Last 7 days';
        break;
      case TimeRange.THIRTY_DAYS:
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 30);
        label = 'Last 30 days';
        break;
      case TimeRange.NINETY_DAYS:
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 90);
        label = 'Last 90 days';
        break;
      case TimeRange.ALL_TIME:
        fromDate = new Date(0);
        label = 'All time';
        break;
      case TimeRange.CUSTOM:
        if (!from || !to) {
          throw new Error('Custom time range requires from and to dates');
        }
        fromDate = new Date(from);
        toDate = new Date(to);
        label = `${from} to ${to}`;
        break;
      default:
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - 7);
        label = 'Last 7 days';
    }

    return { from: fromDate, to: toDate, label };
  }

  private buildFilter(query: StatsQueryDto, from: Date, to: Date): any {
    const filter: any = {
      createdAt: { $gte: from, $lt: to },
    };

    if (query.repo && query.repo !== 'all') {
      filter.repo = query.repo;
    }

    if (query.agent && query.agent !== 'all') {
      filter.recommendedAgent = query.agent;
    }

    if (query.taskType && query.taskType !== 'all') {
      filter.taskType = query.taskType;
    }

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    return filter;
  }

  private calculatePerformanceMetrics(tasks: Task[]): {
    avgTimeToPr: number;
    medianTimeToPr: number;
    p95TimeToPr: number;
    avgTimeToMerge: number;
    medianTimeToMerge: number;
    p95TimeToMerge: number;
  } {
    // Time to PR (dispatchedAt to PR event)
    const timesToPr: number[] = [];
    tasks.forEach(task => {
      if (task.dispatchedAt) {
        const prEvent = task.events?.find(e => e.eventType === 'pr_opened');
        if (prEvent) {
          const timeToPr = (prEvent.createdAt.getTime() - task.dispatchedAt.getTime()) / 1000;
          timesToPr.push(timeToPr);
        }
      }
    });

    // Time to merge (PR open to merge)
    const timesToMerge: number[] = [];
    tasks.forEach(task => {
      const prEvent = task.events?.find(e => e.eventType === 'pr_opened');
      const mergeEvent = task.events?.find(e => e.eventType === 'pr_merged');
      if (prEvent && mergeEvent) {
        const timeToMerge = (mergeEvent.createdAt.getTime() - prEvent.createdAt.getTime()) / 1000;
        timesToMerge.push(timeToMerge);
      }
    });

    return {
      avgTimeToPr: this.calculateAvg(timesToPr),
      medianTimeToPr: this.calculateMedian(timesToPr),
      p95TimeToPr: this.calculatePercentile(timesToPr, 95),
      avgTimeToMerge: this.calculateAvg(timesToMerge),
      medianTimeToMerge: this.calculateMedian(timesToMerge),
      p95TimeToMerge: this.calculatePercentile(timesToMerge, 95),
    };
  }

  private calculateAvg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private groupBy(tasks: Task[], field: string): Record<string, number> {
    const groups: Record<string, number> = {};
    tasks.forEach(task => {
      const value = (task as any)[field] || 'unknown';
      groups[value] = (groups[value] || 0) + 1;
    });
    return groups;
  }

  private async calculateTrends(
    query: StatsQueryDto,
    from: Date,
    to: Date,
    current: { completionRate: number; successRate: number; avgTimeToPr: number }
  ): Promise<{ completionTrend: number; successRateTrend: number; avgTimeToPrTrend: number }> {
    // Get previous period
    const duration = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - duration);
    const previousTo = new Date(from);

    const previousFilter = this.buildFilter(query, previousFrom, previousTo);
    const previousTasks = await this.taskModel.find(previousFilter).exec();

    const previousMerged = previousTasks.filter(t => t.status === TaskStatus.MERGED).length;
    const previousFailed = previousTasks.filter(t => t.status === TaskStatus.FAILED).length;
    const previousDispatched = previousTasks.filter(t =>
      [TaskStatus.DISPATCHED, TaskStatus.CODING, TaskStatus.PR_OPEN, TaskStatus.MERGED].includes(t.status as TaskStatus)
    ).length;

    const previousCompletionRate = previousDispatched > 0 ? (previousMerged / previousDispatched) * 100 : 0;
    const previousSuccessRate = (previousMerged + previousFailed) > 0 ? (previousMerged / (previousMerged + previousFailed)) * 100 : 0;
    const previousPerformance = this.calculatePerformanceMetrics(previousTasks);

    return {
      completionTrend: this.calculatePercentageChange(previousCompletionRate, current.completionRate),
      successRateTrend: this.calculatePercentageChange(previousSuccessRate, current.successRate),
      avgTimeToPrTrend: this.calculatePercentageChange(previousPerformance.avgTimeToPr, current.avgTimeToPr),
    };
  }

  private calculatePercentageChange(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return ((newValue - oldValue) / oldValue) * 100;
  }
}
