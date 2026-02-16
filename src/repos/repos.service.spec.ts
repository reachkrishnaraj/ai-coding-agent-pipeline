import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReposService } from './repos.service';
import { UserRepo } from '../common/schemas/user-repo.schema';
import { Task } from '../common/schemas/task.schema';

// Mock Octokit so the constructor doesn't fail
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

describe('ReposService', () => {
  let service: ReposService;

  const mockUserRepoModel = {
    find: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  // Constructor function for 'new this.userRepoModel(..)'
  const MockUserRepoModelConstructor: any = jest.fn().mockImplementation((data) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  Object.assign(MockUserRepoModelConstructor, mockUserRepoModel);

  const mockTaskModel = {
    find: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        GITHUB_TOKEN: 'ghp_test123',
        ALLOWED_REPOS: 'mothership/',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReposService,
        {
          provide: getModelToken(UserRepo.name),
          useValue: MockUserRepoModelConstructor,
        },
        {
          provide: getModelToken(Task.name),
          useValue: mockTaskModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ReposService>(ReposService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserRepos', () => {
    it('should return user repos without stats', async () => {
      const mockRepos = [
        { repoName: 'mothership/service-a', isActive: true, toJSON: () => ({ repoName: 'mothership/service-a' }) },
        { repoName: 'mothership/service-b', isActive: true, toJSON: () => ({ repoName: 'mothership/service-b' }) },
      ];

      mockUserRepoModel.find.mockReturnThis();
      mockUserRepoModel.sort.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepos);

      const result = await service.getUserRepos('test-user', false);

      expect(result).toEqual(mockRepos);
      expect(mockUserRepoModel.find).toHaveBeenCalledWith({ userId: 'test-user', isActive: true });
    });

    it('should return user repos with stats when requested', async () => {
      const mockRepos = [
        {
          repoName: 'mothership/service-a',
          toJSON: () => ({ repoName: 'mothership/service-a' }),
        },
      ];

      mockUserRepoModel.find.mockReturnThis();
      mockUserRepoModel.sort.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepos);

      // Mock getRepoStats via taskModel
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue([]);

      const result = await service.getUserRepos('test-user', true);

      expect(result).toHaveLength(1);
    });
  });

  describe('getRepoById', () => {
    it('should return a repo by id', async () => {
      const mockRepo = { _id: '123', repoName: 'mothership/service-a' };

      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepo);

      const result = await service.getRepoById('123');

      expect(result).toEqual(mockRepo);
      expect(mockUserRepoModel.findById).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException when repo not found', async () => {
      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(null);

      await expect(service.getRepoById('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addRepo', () => {
    it('should reject invalid repo name format', async () => {
      await expect(
        service.addRepo('test-user', 'invalid-name'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject repos not matching allowed prefixes', async () => {
      await expect(
        service.addRepo('test-user', 'other-org/repo'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return existing active repo (idempotent)', async () => {
      const existingRepo = {
        userId: 'test-user',
        repoName: 'mothership/service-a',
        isActive: true,
        save: jest.fn(),
      };

      mockUserRepoModel.findOne.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(existingRepo);

      const result = await service.addRepo('test-user', 'mothership/service-a');

      expect(result).toEqual(existingRepo);
      expect(existingRepo.save).not.toHaveBeenCalled();
    });

    it('should reactivate a soft-deleted repo', async () => {
      const inactiveRepo = {
        userId: 'test-user',
        repoName: 'mothership/service-a',
        isActive: false,
        addedAt: new Date('2025-01-01'),
        removedAt: new Date('2025-06-01'),
        save: jest.fn().mockResolvedValue({}),
      };

      mockUserRepoModel.findOne.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(inactiveRepo);

      const result = await service.addRepo('test-user', 'mothership/service-a');

      expect(result.isActive).toBe(true);
      expect(result.removedAt).toBeUndefined();
      expect(inactiveRepo.save).toHaveBeenCalled();
    });
  });

  describe('removeRepo', () => {
    it('should soft-delete a repo', async () => {
      const mockRepo = {
        _id: '123',
        userId: 'test-user',
        repoName: 'mothership/service-a',
        isActive: true,
        save: jest.fn().mockResolvedValue({}),
      };

      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepo);

      await service.removeRepo('test-user', '123');

      expect(mockRepo.isActive).toBe(false);
      expect(mockRepo.removedAt).toBeDefined();
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when repo not found', async () => {
      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(null);

      await expect(service.removeRepo('test-user', '999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user does not own the repo', async () => {
      const mockRepo = {
        _id: '123',
        userId: 'other-user',
        repoName: 'mothership/service-a',
      };

      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepo);

      await expect(
        service.removeRepo('test-user', '123'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRepoStats', () => {
    it('should return stats with no tasks', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue([]);

      const result = await service.getRepoStats('mothership/service-a');

      expect(result).toEqual({
        totalTasks: 0,
        statusBreakdown: {
          received: 0,
          analyzing: 0,
          needsClarification: 0,
          dispatched: 0,
          coding: 0,
          prOpen: 0,
          merged: 0,
          failed: 0,
        },
        successRate: 0,
        health: 'gray',
        lastTaskAt: undefined,
      });
      expect(mockTaskModel.find).toHaveBeenCalledWith({ repo: 'mothership/service-a' });
    });

    it('should calculate green health for high success rate', async () => {
      const mockTasks = [
        { status: 'merged', createdAt: new Date('2026-01-01') },
        { status: 'merged', createdAt: new Date('2026-01-02') },
        { status: 'merged', createdAt: new Date('2026-01-03') },
        { status: 'merged', createdAt: new Date('2026-01-04') },
        { status: 'failed', createdAt: new Date('2026-01-05') },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getRepoStats('mothership/service-a');

      expect(result.totalTasks).toBe(5);
      expect(result.statusBreakdown.merged).toBe(4);
      expect(result.statusBreakdown.failed).toBe(1);
      expect(result.successRate).toBe(80);
      expect(result.health).toBe('green');
    });

    it('should calculate yellow health for moderate success rate', async () => {
      const mockTasks = [
        { status: 'merged', createdAt: new Date() },
        { status: 'merged', createdAt: new Date() },
        { status: 'merged', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getRepoStats('mothership/service-a');

      expect(result.successRate).toBe(60);
      expect(result.health).toBe('yellow');
    });

    it('should calculate red health for low success rate', async () => {
      const mockTasks = [
        { status: 'merged', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
        { status: 'failed', createdAt: new Date() },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getRepoStats('mothership/service-a');

      expect(result.successRate).toBe(25);
      expect(result.health).toBe('red');
    });

    it('should track lastTaskAt from most recent task', async () => {
      const latestDate = new Date('2026-02-15');
      const mockTasks = [
        { status: 'merged', createdAt: new Date('2026-01-01') },
        { status: 'dispatched', createdAt: latestDate },
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTasks);

      const result = await service.getRepoStats('mothership/service-a');

      expect(result.lastTaskAt).toEqual(latestDate);
    });
  });

  describe('updateRepoSettings', () => {
    it('should update repo settings', async () => {
      const mockRepo = {
        _id: '123',
        userId: 'test-user',
        repoName: 'mothership/service-a',
        defaultAgent: 'claude-code',
        customSystemPrompt: undefined,
        save: jest.fn().mockResolvedValue({}),
      };

      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepo);

      const result = await service.updateRepoSettings('test-user', '123', {
        defaultAgent: 'codex',
        customSystemPrompt: 'Custom prompt',
      });

      expect(result.defaultAgent).toBe('codex');
      expect(result.customSystemPrompt).toBe('Custom prompt');
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when repo not found', async () => {
      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(null);

      await expect(
        service.updateRepoSettings('test-user', '999', { defaultAgent: 'codex' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the repo', async () => {
      const mockRepo = {
        _id: '123',
        userId: 'other-user',
        repoName: 'mothership/service-a',
      };

      mockUserRepoModel.findById.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(mockRepo);

      await expect(
        service.updateRepoSettings('test-user', '123', { defaultAgent: 'codex' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateUserRepoAccess', () => {
    it('should return true when user has access', async () => {
      mockUserRepoModel.findOne.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue({ userId: 'test-user', repoName: 'mothership/service-a' });

      const result = await service.validateUserRepoAccess('test-user', 'mothership/service-a');

      expect(result).toBe(true);
      expect(mockUserRepoModel.findOne).toHaveBeenCalledWith({
        userId: 'test-user',
        repoName: 'mothership/service-a',
        isActive: true,
      });
    });

    it('should return false when user does not have access', async () => {
      mockUserRepoModel.findOne.mockReturnThis();
      mockUserRepoModel.exec.mockResolvedValue(null);

      const result = await service.validateUserRepoAccess('test-user', 'mothership/private-repo');

      expect(result).toBe(false);
    });
  });
});
