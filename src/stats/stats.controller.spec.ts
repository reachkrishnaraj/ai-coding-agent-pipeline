import { Test, TestingModule } from '@nestjs/testing';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

describe('StatsController', () => {
  let controller: StatsController;
  let service: StatsService;

  const mockStatsService = {
    getMetrics: jest.fn(),
    getDailyVolume: jest.fn(),
    getUserActivity: jest.fn(),
    getAgentPerformance: jest.fn(),
    getFailures: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        {
          provide: StatsService,
          useValue: mockStatsService,
        },
      ],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    service = module.get<StatsService>(StatsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getOverview', () => {
    it('should return metrics for the given query', async () => {
      const query = { timeRange: '7d' as any };
      const mockMetrics = {
        period: { from: '2026-01-01', to: '2026-01-08', label: 'Last 7 days' },
        volume: { tasksCreated: 10, tasksDispatched: 8, tasksMerged: 5, tasksFailed: 1, tasksInProgress: 2 },
        quality: { successRate: 83.3, failureRate: 16.7, clarificationRate: 10 },
        performance: { avgTimeToPr: 3600, medianTimeToPr: 3000, p95TimeToPr: 7200, avgTimeToMerge: 1800, medianTimeToMerge: 1500, p95TimeToMerge: 3600 },
        breakdown: { byStatus: {}, byTaskType: {}, byAgent: {}, byRepo: {} },
        trends: { completionTrend: 5, successRateTrend: 2, avgTimeToPrTrend: -10 },
        cached: false,
      };

      mockStatsService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getOverview(query);

      expect(result).toEqual(mockMetrics);
      expect(service.getMetrics).toHaveBeenCalledWith(query);
    });
  });

  describe('getByStatus', () => {
    it('should return breakdown by status and period', async () => {
      const query = { timeRange: '7d' as any };
      const mockMetrics = {
        period: { from: '2026-01-01', to: '2026-01-08', label: 'Last 7 days' },
        breakdown: {
          byStatus: { received: 2, dispatched: 5, merged: 3 },
          byRepo: {},
        },
      };

      mockStatsService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getByStatus(query);

      expect(result).toEqual({
        byStatus: { received: 2, dispatched: 5, merged: 3 },
        period: { from: '2026-01-01', to: '2026-01-08', label: 'Last 7 days' },
      });
      expect(service.getMetrics).toHaveBeenCalledWith(query);
    });
  });

  describe('getByRepo', () => {
    it('should return breakdown by repo and period', async () => {
      const query = { timeRange: '30d' as any };
      const mockMetrics = {
        period: { from: '2025-12-15', to: '2026-01-14', label: 'Last 30 days' },
        breakdown: {
          byStatus: {},
          byRepo: { 'mothership/finance-service': 8, 'mothership/web-app': 3 },
        },
      };

      mockStatsService.getMetrics.mockResolvedValue(mockMetrics);

      const result = await controller.getByRepo(query);

      expect(result).toEqual({
        byRepo: { 'mothership/finance-service': 8, 'mothership/web-app': 3 },
        period: { from: '2025-12-15', to: '2026-01-14', label: 'Last 30 days' },
      });
      expect(service.getMetrics).toHaveBeenCalledWith(query);
    });
  });

  describe('getTrends', () => {
    it('should return daily volume data', async () => {
      const query = { timeRange: '7d' as any };
      const mockResult = {
        data: [
          { date: '2026-01-01', tasksCreated: 5, tasksMerged: 3, tasksFailed: 0 },
          { date: '2026-01-02', tasksCreated: 3, tasksMerged: 2, tasksFailed: 1 },
        ],
        period: { from: '2026-01-01', to: '2026-01-08' },
      };

      mockStatsService.getDailyVolume.mockResolvedValue(mockResult);

      const result = await controller.getTrends(query);

      expect(result).toEqual(mockResult);
      expect(service.getDailyVolume).toHaveBeenCalledWith(query);
    });
  });

  describe('getByUser', () => {
    it('should return user activity with default pagination', async () => {
      const query = { timeRange: '7d' as any };
      const mockResult = {
        users: [
          { userId: 'user1', tasksCreated: 5, tasksMerged: 3, tasksFailed: 0, successRate: 100, avgTimeToPr: 3600, agentDistribution: {} },
        ],
        pagination: { page: 1, limit: 20, total: 1, hasMore: false },
        period: { from: '2026-01-01', to: '2026-01-08' },
      };

      mockStatsService.getUserActivity.mockResolvedValue(mockResult);

      const result = await controller.getByUser(query, 1, 20);

      expect(result).toEqual(mockResult);
      expect(service.getUserActivity).toHaveBeenCalledWith(query, 1, 20);
    });

    it('should pass custom page and limit', async () => {
      const query = { timeRange: '30d' as any };
      const mockResult = {
        users: [],
        pagination: { page: 2, limit: 10, total: 15, hasMore: true },
        period: { from: '2025-12-15', to: '2026-01-14' },
      };

      mockStatsService.getUserActivity.mockResolvedValue(mockResult);

      const result = await controller.getByUser(query, 2, 10);

      expect(result).toEqual(mockResult);
      expect(service.getUserActivity).toHaveBeenCalledWith(query, 2, 10);
    });
  });

  describe('getAgentPerformance', () => {
    it('should return agent performance data', async () => {
      const query = { timeRange: '7d' as any };
      const mockResult = {
        agents: [
          {
            name: 'claude-code',
            totalTasks: 10,
            mergedCount: 8,
            failedCount: 1,
            successRate: 88.9,
            avgTimeToPr: 3600,
            avgTimeToMerge: 1800,
            taskBreakdown: {},
          },
        ],
        period: { from: '2026-01-01', to: '2026-01-08' },
      };

      mockStatsService.getAgentPerformance.mockResolvedValue(mockResult);

      const result = await controller.getAgentPerformance(query);

      expect(result).toEqual(mockResult);
      expect(service.getAgentPerformance).toHaveBeenCalledWith(query);
    });
  });

  describe('getFailures', () => {
    it('should return failures with default pagination', async () => {
      const query = { timeRange: '7d' as any };
      const mockResult = {
        failures: [
          {
            taskId: '123',
            description: 'Fix the bug...',
            failureReason: 'LLM_API_ERROR',
            failedAt: '2026-01-05T12:00:00Z',
            status: 'failed',
            errorMessage: 'API timeout',
            githubIssueUrl: 'https://github.com/mothership/test/issues/1',
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, hasMore: false },
      };

      mockStatsService.getFailures.mockResolvedValue(mockResult);

      const result = await controller.getFailures(query, 1, 10);

      expect(result).toEqual(mockResult);
      expect(service.getFailures).toHaveBeenCalledWith(query, 1, 10);
    });

    it('should pass custom page and limit', async () => {
      const query = {};
      const mockResult = {
        failures: [],
        pagination: { page: 3, limit: 5, total: 12, hasMore: false },
      };

      mockStatsService.getFailures.mockResolvedValue(mockResult);

      const result = await controller.getFailures(query as any, 3, 5);

      expect(result).toEqual(mockResult);
      expect(service.getFailures).toHaveBeenCalledWith(query, 3, 5);
    });
  });
});
