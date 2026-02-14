import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

describe('TasksService', () => {
  let service: TasksService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    task: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    taskEvent: {
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockLlmService = {
    analyzeTask: jest.fn(),
  };

  const mockGitHubService = {
    createIssue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: 'ILlmService',
          useValue: mockLlmService,
        },
        {
          provide: 'IGitHubService',
          useValue: mockGitHubService,
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('State Machine', () => {
    it('should allow valid transition from received to analyzing', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.received,
          TaskStatus.analyzing,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from analyzing to needs_clarification', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.analyzing,
          TaskStatus.needs_clarification,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from analyzing to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.analyzing,
          TaskStatus.dispatched,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from needs_clarification to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.needs_clarification,
          TaskStatus.dispatched,
        );
      }).not.toThrow();
    });

    it('should reject invalid transition from received to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.received,
          TaskStatus.dispatched,
        );
      }).toThrow(BadRequestException);
    });

    it('should reject invalid transition from merged to any state', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.merged,
          TaskStatus.failed,
        );
      }).toThrow(BadRequestException);
    });

    it('should allow retry transition from failed to received', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.failed,
          TaskStatus.received,
        );
      }).not.toThrow();
    });
  });

  describe('findOne', () => {
    it('should return a task with events', async () => {
      const mockTask = {
        id: '123',
        status: TaskStatus.dispatched,
        description: 'Test task',
        events: [
          { eventType: 'created', createdAt: new Date() },
          { eventType: 'dispatched', createdAt: new Date() },
        ],
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);

      const result = await service.findOne('123');

      expect(result).toEqual(mockTask);
      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: '123' },
        include: {
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });

    it('should throw NotFoundException when task not found', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        { id: '1', description: 'Task 1' },
        { id: '2', description: 'Task 2' },
      ];

      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.task.count.mockResolvedValue(10);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toEqual({
        tasks: mockTasks,
        total: 10,
        page: 1,
        limit: 20,
      });
    });

    it('should filter by status', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll({ status: 'dispatched' });

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'dispatched' },
        }),
      );
    });

    it('should filter by repo', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll({ repo: 'mothership/test-repo' });

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { repo: 'mothership/test-repo' },
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a task in received status', async () => {
      const mockTask = {
        id: '123',
        status: TaskStatus.received,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.task.delete.mockResolvedValue(mockTask);
      mockPrismaService.taskEvent.create.mockResolvedValue({});

      const result = await service.cancel('123');

      expect(result).toEqual({ message: 'Task cancelled successfully' });
      expect(mockPrismaService.task.delete).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should not allow cancelling dispatched task', async () => {
      const mockTask = {
        id: '123',
        status: TaskStatus.dispatched,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);

      await expect(service.cancel('123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when task not found', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.cancel('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHealth', () => {
    it('should return ok when database is connected', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getHealth();

      expect(result).toEqual({ status: 'ok', db: 'connected' });
    });

    it('should return error when database is disconnected', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection failed'),
      );

      const result = await service.getHealth();

      expect(result.status).toBe('error');
      expect(result.db).toBe('disconnected');
    });
  });
});
