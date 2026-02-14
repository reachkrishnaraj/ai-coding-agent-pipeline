import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { Task } from '../common/schemas/task.schema';
import { TaskStatus } from '../common/enums/task-status.enum';

describe('TasksService', () => {
  let service: TasksService;

  // Mock document that behaves like a Mongoose document
  const createMockDocument = (data: any) => ({
    ...data,
    _id: data.id || data._id || '123',
    toJSON: () => ({ ...data, id: data.id || data._id || '123' }),
    save: jest.fn().mockResolvedValue({ ...data, _id: '123' }),
  });

  const mockTaskModel = {
    find: jest.fn().mockReturnThis(),
    findById: jest.fn().mockReturnThis(),
    findOne: jest.fn().mockReturnThis(),
    findByIdAndUpdate: jest.fn().mockReturnThis(),
    findByIdAndDelete: jest.fn().mockReturnThis(),
    countDocuments: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  // Mock constructor for creating new documents
  const MockTaskModelConstructor: any = function (data: any) {
    return createMockDocument(data);
  };
  Object.assign(MockTaskModelConstructor, mockTaskModel);

  const mockConnection = {
    db: {
      admin: () => ({
        ping: jest.fn().mockResolvedValue({}),
      }),
    },
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
          provide: getModelToken(Task.name),
          useValue: MockTaskModelConstructor,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
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
          TaskStatus.RECEIVED,
          TaskStatus.ANALYZING,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from analyzing to needs_clarification', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.ANALYZING,
          TaskStatus.NEEDS_CLARIFICATION,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from analyzing to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.ANALYZING,
          TaskStatus.DISPATCHED,
        );
      }).not.toThrow();
    });

    it('should allow valid transition from needs_clarification to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.NEEDS_CLARIFICATION,
          TaskStatus.DISPATCHED,
        );
      }).not.toThrow();
    });

    it('should reject invalid transition from received to dispatched', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.RECEIVED,
          TaskStatus.DISPATCHED,
        );
      }).toThrow(BadRequestException);
    });

    it('should reject invalid transition from merged to any state', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.MERGED,
          TaskStatus.FAILED,
        );
      }).toThrow(BadRequestException);
    });

    it('should allow retry transition from failed to received', () => {
      expect(() => {
        (service as any).validateTransition(
          TaskStatus.FAILED,
          TaskStatus.RECEIVED,
        );
      }).not.toThrow();
    });
  });

  describe('findOne', () => {
    it('should return a task with events', async () => {
      const mockTask = createMockDocument({
        id: '123',
        status: TaskStatus.DISPATCHED,
        description: 'Test task',
        events: [
          { eventType: 'created', createdAt: new Date() },
          { eventType: 'dispatched', createdAt: new Date() },
        ],
      });

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTask);

      const result = await service.findOne('123');

      expect(result).toHaveProperty('id', '123');
      expect(mockTaskModel.findById).toHaveBeenCalledWith('123');
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const mockTasks = [
        createMockDocument({ id: '1', description: 'Task 1' }),
        createMockDocument({ id: '2', description: 'Task 2' }),
      ];

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTasks);
      mockTaskModel.countDocuments.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(10);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(10);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce([]);
      mockTaskModel.countDocuments.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ status: 'dispatched' });

      expect(mockTaskModel.find).toHaveBeenCalledWith({ status: 'dispatched' });
    });

    it('should filter by repo', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.skip.mockReturnThis();
      mockTaskModel.limit.mockReturnThis();
      mockTaskModel.sort.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce([]);
      mockTaskModel.countDocuments.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(0);

      await service.findAll({ repo: 'mothership/test-repo' });

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        repo: 'mothership/test-repo',
      });
    });
  });

  describe('cancel', () => {
    it('should cancel a task in received status', async () => {
      const mockTask = createMockDocument({
        id: '123',
        _id: '123',
        status: TaskStatus.RECEIVED,
      });

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);
      mockTaskModel.findByIdAndDelete.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      const result = await service.cancel('123');

      expect(result).toEqual({ message: 'Task cancelled successfully' });
    });

    it('should not allow cancelling dispatched task', async () => {
      const mockTask = createMockDocument({
        id: '123',
        status: TaskStatus.DISPATCHED,
      });

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(mockTask);

      await expect(service.cancel('123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValue(null);

      await expect(service.cancel('999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHealth', () => {
    it('should return ok when database is connected', async () => {
      const result = await service.getHealth();

      expect(result).toEqual({ status: 'ok', db: 'connected' });
    });

    it('should return error when database is disconnected', async () => {
      const failingConnection = {
        db: {
          admin: () => ({
            ping: jest.fn().mockRejectedValue(new Error('Connection failed')),
          }),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TasksService,
          {
            provide: getModelToken(Task.name),
            useValue: MockTaskModelConstructor,
          },
          {
            provide: getConnectionToken(),
            useValue: failingConnection,
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

      const failingService = module.get<TasksService>(TasksService);
      const result = await failingService.getHealth();

      expect(result.status).toBe('error');
      expect(result.db).toBe('disconnected');
    });
  });
});
