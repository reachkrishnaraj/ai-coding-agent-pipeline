import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { StatsService } from './stats.service';
import { Task } from '../common/schemas/task.schema';
import { AnalyticsDaily } from '../common/schemas/analytics-daily.schema';
import { AnalyticsWeekly } from '../common/schemas/analytics-weekly.schema';
import { TaskStatus } from '../common/enums/task-status.enum';
import { TimeRange } from './dto/stats-query.dto';

describe('StatsService', () => {
  let service: StatsService;

  const mockTaskModel = {
    find: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    countDocuments: jest.fn(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockAnalyticsDailyModel = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockAnalyticsWeeklyModel = {
    find: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: getModelToken(Task.name),
          useValue: mockTaskModel,
        },
        {
          provide: getModelToken(AnalyticsDaily.name),
          useValue: mockAnalyticsDailyModel,
        },
        {
          provide: getModelToken(AnalyticsWeekly.name),
          useValue: mockAnalyticsWeeklyModel,
        },
      ],
    }).compile();

    service = module.get<StatsService>(StatsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMetrics', () => {
    it('should return metrics with volume, quality, performance, and breakdown', async () => {
      const now = new Date();
      const prOpenedAt = new Date(now.getTime() - 3600000); // 1 hour ago
      const dispatchedAt = new Date(now.getTime() - 7200000); // 2 hours ago

      const mockTasks = [
        {
          status: TaskStatus.MERGED,
          taskType: 'bug_fix',
          recommendedAgent: 'claude-code',
          repo: 'mothership/finance-service',
          clarificationQuestions: [],
          dispatchedAt,
          events: [
            { eventType: 'pr_opened', createdAt: prOpenedAt },
            { eventType: 'pr_merged', createdAt: now },
          ],
        },
        {
          status: TaskStatus.FAILED,
          taskType: 'feature',
          recommendedAgent: 'claude-code',
          repo: 'mothership/web-app',
          clarificationQuestions: ['What is the expected behavior?'],
          dispatchedAt: null,
          events: [],
        },
        {
          status: TaskStatus.DISPATCHED,
          taskType: 'bug_fix',
          recommendedAgent: 'codex',
          repo: 'mothership/finance-service',
          clarificationQuestions: [],
          dispatchedAt: new Date(),
          events: [],
        },
      ];

      // First call: current period tasks
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTasks)    // getMetrics main query
        .mockResolvedValueOnce([]);          // calculateTrends previous period

      const result = await service.getMetrics({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.volume.tasksCreated).toBe(3);
      expect(result.volume.tasksMerged).toBe(1);
      expect(result.volume.tasksFailed).toBe(1);
      expect(result.volume.tasksDispatched).toBe(2); // MERGED + DISPATCHED
      expect(result.volume.tasksInProgress).toBe(1); // DISPATCHED only
      expect(result.quality.successRate).toBe(50); // 1 merged / (1 merged + 1 failed) * 100
      expect(result.quality.failureRate).toBe(50);
      expect(result.quality.clarificationRate).toBeGreaterThan(0);
      expect(result.breakdown.byStatus).toBeDefined();
      expect(result.breakdown.byRepo).toBeDefined();
      expect(result.breakdown.byAgent).toBeDefined();
      expect(result.period.label).toBe('Last 7 days');
      expect(result.cached).toBe(false);
    });

    it('should return cached result on second call with same query', async () => {
      const mockTasks: any[] = [];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTasks)
        .mockResolvedValueOnce([]);

      const query = { timeRange: TimeRange.TODAY, repo: 'test-cache' };

      // First call - computes
      const result1 = await service.getMetrics(query);
      expect(result1).toBeDefined();

      // Second call - should return cached
      const result2 = await service.getMetrics(query);
      expect(result2).toEqual(result1);

      // find should only have been called for the first request (2 calls: main + trends)
      // The second call returns from cache without querying
      expect(mockTaskModel.find).toHaveBeenCalledTimes(2);
    });

    it('should handle zero tasks gracefully', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getMetrics({ timeRange: TimeRange.ALL_TIME });

      expect(result.volume.tasksCreated).toBe(0);
      expect(result.quality.successRate).toBe(0);
      expect(result.quality.failureRate).toBe(0);
      expect(result.quality.clarificationRate).toBe(0);
      expect(result.performance.avgTimeToPr).toBe(0);
      expect(result.performance.avgTimeToMerge).toBe(0);
    });

    it('should apply repo filter', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ repo: 'mothership/finance-service', timeRange: TimeRange.SEVEN_DAYS });

      expect(mockTaskModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'mothership/finance-service' }),
      );
    });

    it('should apply agent filter', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ agent: 'claude-code', timeRange: TimeRange.SEVEN_DAYS });

      expect(mockTaskModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ recommendedAgent: 'claude-code' }),
      );
    });

    it('should not add repo filter when set to all', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ repo: 'all', timeRange: TimeRange.THIRTY_DAYS });

      const filter = mockTaskModel.find.mock.calls[0][0];
      expect(filter.repo).toBeUndefined();
    });
  });

  describe('getDailyVolume', () => {
    it('should return daily volume data from analytics model', async () => {
      const mockAnalytics = [
        {
          date: new Date('2026-01-01'),
          tasksCreated: 5,
          tasksCompleted: 3,
          tasksFailed: 1,
        },
        {
          date: new Date('2026-01-02'),
          tasksCreated: 8,
          tasksCompleted: 6,
          tasksFailed: 0,
        },
      ];

      mockAnalyticsDailyModel.find.mockReturnThis();
      mockAnalyticsDailyModel.sort.mockReturnThis();
      mockAnalyticsDailyModel.exec.mockResolvedValue(mockAnalytics);

      const result = await service.getDailyVolume({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].date).toBe('2026-01-01');
      expect(result.data[0].tasksCreated).toBe(5);
      expect(result.data[0].tasksMerged).toBe(3);
      expect(result.data[0].tasksFailed).toBe(1);
      expect(result.period).toBeDefined();
      expect(result.period.from).toBeDefined();
      expect(result.period.to).toBeDefined();
    });

    it('should return empty data when no analytics exist', async () => {
      mockAnalyticsDailyModel.find.mockReturnThis();
      mockAnalyticsDailyModel.sort.mockReturnThis();
      mockAnalyticsDailyModel.exec.mockResolvedValue([]);

      const result = await service.getDailyVolume({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.data).toHaveLength(0);
      expect(result.period).toBeDefined();
    });
  });

  describe('getAgentPerformance', () => {
    it('should return agent performance grouped by agent', async () => {
      const mockTasks = [
        {
          status: TaskStatus.MERGED,
          recommendedAgent: 'claude-code',
          taskType: 'bug_fix',
          dispatchedAt: new Date(),
          events: [],
        },
        {
          status: TaskStatus.FAILED,
          recommendedAgent: 'claude-code',
          taskType: 'feature',
          dispatchedAt: new Date(),
          events: [],
        },
        {
          status: TaskStatus.MERGED,
          recommendedAgent: 'codex',
          taskType: 'bug_fix',
          dispatchedAt: new Date(),
          events: [],
        },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getAgentPerformance({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.agents).toHaveLength(2);
      // Sorted by success rate descending: codex (100%) first, claude-code (50%) second
      expect(result.agents[0].name).toBe('codex');
      expect(result.agents[0].totalTasks).toBe(1);
      expect(result.agents[0].successRate).toBe(100);
      expect(result.agents[1].name).toBe('claude-code');
      expect(result.agents[1].totalTasks).toBe(2);
      expect(result.agents[1].mergedCount).toBe(1);
      expect(result.agents[1].failedCount).toBe(1);
      expect(result.agents[1].successRate).toBe(50);
      expect(result.period).toBeDefined();
    });

    it('should group unknown agents correctly', async () => {
      const mockTasks = [
        {
          status: TaskStatus.DISPATCHED,
          recommendedAgent: undefined,
          taskType: 'bug_fix',
          events: [],
        },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getAgentPerformance({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].name).toBe('unknown');
    });

    it('should return empty agents when no tasks exist', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue([]);

      const result = await service.getAgentPerformance({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.agents).toHaveLength(0);
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity grouped by user with pagination', async () => {
      const mockTasks = [
        {
          status: TaskStatus.MERGED,
          createdBy: 'user1',
          recommendedAgent: 'claude-code',
          dispatchedAt: new Date(),
          events: [],
        },
        {
          status: TaskStatus.MERGED,
          createdBy: 'user1',
          recommendedAgent: 'claude-code',
          dispatchedAt: new Date(),
          events: [],
        },
        {
          status: TaskStatus.FAILED,
          createdBy: 'user2',
          recommendedAgent: 'codex',
          dispatchedAt: new Date(),
          events: [],
        },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getUserActivity({ timeRange: TimeRange.SEVEN_DAYS }, 1, 20);

      expect(result.users).toHaveLength(2);
      // Sorted by tasksCreated descending: user1 (2) first
      expect(result.users[0].userId).toBe('user1');
      expect(result.users[0].tasksCreated).toBe(2);
      expect(result.users[0].tasksMerged).toBe(2);
      expect(result.users[0].successRate).toBe(100);
      expect(result.users[1].userId).toBe('user2');
      expect(result.users[1].tasksCreated).toBe(1);
      expect(result.users[1].tasksFailed).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should paginate user results', async () => {
      const mockTasks = Array.from({ length: 5 }, (_, i) => ({
        status: TaskStatus.MERGED,
        createdBy: `user${i}`,
        recommendedAgent: 'claude-code',
        dispatchedAt: new Date(),
        events: [],
      }));

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getUserActivity({ timeRange: TimeRange.SEVEN_DAYS }, 1, 2);

      expect(result.users).toHaveLength(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
    });
  });

  describe('getFailures', () => {
    it('should return failed tasks with pagination', async () => {
      const mockTasks = [
        {
          _id: { toString: () => '123' },
          description: 'Fix the authentication bug in the login flow',
          failureReason: 'LLM_API_ERROR',
          updatedAt: new Date('2026-01-05T12:00:00Z'),
          createdAt: new Date('2026-01-05T10:00:00Z'),
          status: TaskStatus.FAILED,
          errorMessage: 'API timeout after 30 seconds',
          githubIssueUrl: 'https://github.com/mothership/test/issues/1',
        },
      ];

      mockTaskModel.countDocuments.mockResolvedValue(1);
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getFailures({ timeRange: TimeRange.SEVEN_DAYS }, 1, 10);

      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].taskId).toBe('123');
      expect(result.failures[0].failureReason).toBe('LLM_API_ERROR');
      expect(result.failures[0].errorMessage).toBe('API timeout after 30 seconds');
      expect(result.failures[0].status).toBe(TaskStatus.FAILED);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('should truncate long descriptions to 100 chars with ellipsis', async () => {
      const longDescription = 'A'.repeat(150);
      const mockTasks = [
        {
          _id: { toString: () => '456' },
          description: longDescription,
          failureReason: 'TRANSIENT_ERROR',
          updatedAt: new Date(),
          createdAt: new Date(),
          status: TaskStatus.FAILED,
          errorMessage: 'Connection reset',
        },
      ];

      mockTaskModel.countDocuments.mockResolvedValue(1);
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getFailures({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.failures[0].description).toHaveLength(103); // 100 + '...'
      expect(result.failures[0].description.endsWith('...')).toBe(true);
    });

    it('should use default values for missing failure fields', async () => {
      const mockTasks = [
        {
          _id: { toString: () => '789' },
          description: 'Short desc',
          failureReason: undefined,
          updatedAt: undefined,
          createdAt: undefined,
          status: TaskStatus.FAILED,
          errorMessage: undefined,
        },
      ];

      mockTaskModel.countDocuments.mockResolvedValue(1);
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getFailures({ timeRange: TimeRange.SEVEN_DAYS });

      expect(result.failures[0].failureReason).toBe('Unknown');
      expect(result.failures[0].errorMessage).toBe('No error message');
      expect(result.failures[0].failedAt).toBe('');
    });

    it('should calculate hasMore correctly', async () => {
      mockTaskModel.countDocuments.mockResolvedValue(25);
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue([]);

      const result = await service.getFailures({ timeRange: TimeRange.SEVEN_DAYS }, 2, 10);

      expect(result.pagination.hasMore).toBe(true);

      mockTaskModel.countDocuments.mockResolvedValue(25);
      mockTaskModel.exec.mockResolvedValue([]);

      const result2 = await service.getFailures({ timeRange: TimeRange.THIRTY_DAYS }, 3, 10);

      expect(result2.pagination.hasMore).toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate cache entries matching a pattern', async () => {
      // Populate cache by calling getMetrics
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ timeRange: TimeRange.SEVEN_DAYS });

      // Invalidate with pattern
      service.invalidateCache('metrics');

      // Next call should query again (cache miss)
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ timeRange: TimeRange.SEVEN_DAYS });

      // find should have been called 4 times (2 for first call, 2 for second after invalidation)
      expect(mockTaskModel.find).toHaveBeenCalledTimes(4);
    });

    it('should flush all cache when no pattern is provided', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ timeRange: TimeRange.TODAY });

      service.invalidateCache();

      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await service.getMetrics({ timeRange: TimeRange.TODAY });

      expect(mockTaskModel.find).toHaveBeenCalledTimes(4);
    });
  });

  describe('getDateRange (via getMetrics)', () => {
    it('should handle custom time range with from/to', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getMetrics({
        timeRange: TimeRange.CUSTOM,
        from: '2026-01-01',
        to: '2026-01-15',
      });

      expect(result.period.label).toBe('2026-01-01 to 2026-01-15');
    });

    it('should throw error for custom range without dates', async () => {
      await expect(
        service.getMetrics({ timeRange: TimeRange.CUSTOM }),
      ).rejects.toThrow('Custom time range requires from and to dates');
    });
  });
});
