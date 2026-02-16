import { Test, TestingModule } from '@nestjs/testing';
import { ReposController } from './repos.controller';
import { ReposService } from './repos.service';

// Mock Octokit to avoid ESM import issues in tests
jest.mock('@octokit/rest', () => {
  return {
    Octokit: jest.fn().mockImplementation(() => ({
      repos: {
        listForAuthenticatedUser: jest.fn(),
        get: jest.fn(),
      },
    })),
  };
});

describe('ReposController', () => {
  let controller: ReposController;
  let service: ReposService;

  const mockReposService = {
    getUserRepos: jest.fn(),
    getAvailableRepos: jest.fn(),
    addRepo: jest.fn(),
    removeRepo: jest.fn(),
    getRepoById: jest.fn(),
    getRepoStats: jest.fn(),
    updateRepoSettings: jest.fn(),
  };

  const mockReq = {
    user: { username: 'test-user' },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReposController],
      providers: [
        {
          provide: ReposService,
          useValue: mockReposService,
        },
      ],
    }).compile();

    controller = module.get<ReposController>(ReposController);
    service = module.get<ReposService>(ReposService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserRepos', () => {
    it('should return repos without stats by default', async () => {
      const mockRepos = [
        { repoName: 'mothership/service-a', isActive: true },
        { repoName: 'mothership/service-b', isActive: true },
      ];

      mockReposService.getUserRepos.mockResolvedValue(mockRepos);

      const result = await controller.getUserRepos(mockReq);

      expect(result).toEqual({
        repos: mockRepos,
        total: 2,
      });
      expect(service.getUserRepos).toHaveBeenCalledWith('test-user', false);
    });

    it('should include stats when requested', async () => {
      const mockRepos = [
        { repoName: 'mothership/service-a', stats: { totalTasks: 5 } },
      ];

      mockReposService.getUserRepos.mockResolvedValue(mockRepos);

      const result = await controller.getUserRepos(mockReq, 'true');

      expect(result).toEqual({
        repos: mockRepos,
        total: 1,
      });
      expect(service.getUserRepos).toHaveBeenCalledWith('test-user', true);
    });

    it('should return empty list when user has no repos', async () => {
      mockReposService.getUserRepos.mockResolvedValue([]);

      const result = await controller.getUserRepos(mockReq);

      expect(result).toEqual({
        repos: [],
        total: 0,
      });
    });
  });

  describe('getAvailableRepos', () => {
    it('should return available GitHub repos', async () => {
      const mockRepos = [
        { id: 1, name: 'service-a', fullName: 'mothership/service-a', isAdded: false },
        { id: 2, name: 'service-b', fullName: 'mothership/service-b', isAdded: true },
      ];

      mockReposService.getAvailableRepos.mockResolvedValue(mockRepos);

      const result = await controller.getAvailableRepos(mockReq);

      expect(result.repos).toEqual(mockRepos);
      expect(result.total).toBe(2);
      expect(result.cached).toBe(true);
      expect(result).toHaveProperty('cacheExpiresAt');
      expect(service.getAvailableRepos).toHaveBeenCalledWith('test-user');
    });
  });

  describe('addRepo', () => {
    it('should add a repo with default agent', async () => {
      const addRepoDto = { repoName: 'mothership/service-a' };
      const mockRepo = {
        _id: '123',
        userId: 'test-user',
        repoName: 'mothership/service-a',
        defaultAgent: 'claude-code',
      };

      mockReposService.addRepo.mockResolvedValue(mockRepo);

      const result = await controller.addRepo(mockReq, addRepoDto);

      expect(result).toEqual(mockRepo);
      expect(service.addRepo).toHaveBeenCalledWith('test-user', 'mothership/service-a', undefined);
    });

    it('should add a repo with custom agent', async () => {
      const addRepoDto = { repoName: 'mothership/service-a', defaultAgent: 'codex' };
      const mockRepo = {
        _id: '123',
        userId: 'test-user',
        repoName: 'mothership/service-a',
        defaultAgent: 'codex',
      };

      mockReposService.addRepo.mockResolvedValue(mockRepo);

      const result = await controller.addRepo(mockReq, addRepoDto);

      expect(result).toEqual(mockRepo);
      expect(service.addRepo).toHaveBeenCalledWith('test-user', 'mothership/service-a', 'codex');
    });
  });

  describe('removeRepo', () => {
    it('should remove a repo and return status', async () => {
      const mockRepo = {
        _id: '123',
        repoName: 'mothership/service-a',
      };
      const mockStats = { totalTasks: 5 };

      mockReposService.removeRepo.mockResolvedValue(undefined);
      mockReposService.getRepoById.mockResolvedValue(mockRepo);
      mockReposService.getRepoStats.mockResolvedValue(mockStats);

      const result = await controller.removeRepo(mockReq, '123');

      expect(result).toEqual({
        success: true,
        repoName: 'mothership/service-a',
        tasksKept: 5,
        message: 'Repo removed from dashboard. Task history preserved.',
      });
      expect(service.removeRepo).toHaveBeenCalledWith('test-user', '123');
      expect(service.getRepoById).toHaveBeenCalledWith('123');
      expect(service.getRepoStats).toHaveBeenCalledWith('mothership/service-a');
    });
  });

  describe('getRepoStats', () => {
    it('should return stats for a repo', async () => {
      const mockRepo = {
        _id: '123',
        repoName: 'mothership/service-a',
      };
      const mockStats = {
        totalTasks: 10,
        statusBreakdown: {
          received: 1,
          analyzing: 0,
          needsClarification: 0,
          dispatched: 2,
          coding: 1,
          prOpen: 1,
          merged: 4,
          failed: 1,
        },
        successRate: 80,
        health: 'green',
      };

      mockReposService.getRepoById.mockResolvedValue(mockRepo);
      mockReposService.getRepoStats.mockResolvedValue(mockStats);

      const result = await controller.getRepoStats('123');

      expect(result.repoName).toBe('mothership/service-a');
      expect(result.period).toBe('7d');
      expect(result.totalTasks).toBe(10);
      expect(result.health).toBe('green');
      expect(result).toHaveProperty('updatedAt');
      expect(service.getRepoById).toHaveBeenCalledWith('123');
      expect(service.getRepoStats).toHaveBeenCalledWith('mothership/service-a');
    });
  });

  describe('getRepoSettings', () => {
    it('should return repo settings', async () => {
      const mockRepo = {
        _id: { toString: () => '123' },
        repoName: 'mothership/service-a',
        defaultAgent: 'claude-code',
        customSystemPrompt: 'Custom prompt here',
      };

      mockReposService.getRepoById.mockResolvedValue(mockRepo);

      const result = await controller.getRepoSettings(mockReq, '123');

      expect(result).toEqual({
        id: '123',
        repoName: 'mothership/service-a',
        defaultAgent: 'claude-code',
        customSystemPrompt: 'Custom prompt here',
        useCustomPrompt: true,
      });
      expect(service.getRepoById).toHaveBeenCalledWith('123');
    });

    it('should show useCustomPrompt as false when no custom prompt', async () => {
      const mockRepo = {
        _id: { toString: () => '456' },
        repoName: 'mothership/service-b',
        defaultAgent: 'claude-code',
        customSystemPrompt: undefined,
      };

      mockReposService.getRepoById.mockResolvedValue(mockRepo);

      const result = await controller.getRepoSettings(mockReq, '456');

      expect(result.useCustomPrompt).toBe(false);
    });
  });

  describe('updateRepoSettings', () => {
    it('should update repo settings', async () => {
      const updateDto = { defaultAgent: 'codex' };
      const mockRepo = {
        _id: { toString: () => '123' },
        repoName: 'mothership/service-a',
        defaultAgent: 'codex',
        customSystemPrompt: undefined,
        updatedAt: new Date('2026-02-15'),
      };

      mockReposService.updateRepoSettings.mockResolvedValue(mockRepo);

      const result = await controller.updateRepoSettings(mockReq, '123', updateDto);

      expect(result).toEqual({
        id: '123',
        repoName: 'mothership/service-a',
        defaultAgent: 'codex',
        useCustomPrompt: false,
        updatedAt: mockRepo.updatedAt,
      });
      expect(service.updateRepoSettings).toHaveBeenCalledWith('test-user', '123', updateDto);
    });
  });
});
