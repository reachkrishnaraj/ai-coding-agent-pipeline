import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockTasksService = {
    create: jest.fn(),
    clarify: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    retry: jest.fn(),
    cancel: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a task', async () => {
      const createDto = {
        description: 'Fix the bug',
        source: 'api',
      };

      const mockResult = {
        id: '123',
        status: 'analyzing',
      };

      mockTasksService.create.mockResolvedValue(mockResult);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockResult);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('clarify', () => {
    it('should submit clarification answers', async () => {
      const clarifyDto = {
        answers: ['Answer 1', 'Answer 2'],
      };

      const mockResult = {
        id: '123',
        status: 'dispatched',
      };

      mockTasksService.clarify.mockResolvedValue(mockResult);

      const result = await controller.clarify('123', clarifyDto);

      expect(result).toEqual(mockResult);
      expect(service.clarify).toHaveBeenCalledWith('123', clarifyDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks', async () => {
      const query = { page: 1, limit: 20 };
      const mockResult = {
        tasks: [],
        total: 0,
        page: 1,
        limit: 20,
      };

      mockTasksService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(query);

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return a task by id', async () => {
      const mockTask = {
        id: '123',
        description: 'Test task',
        events: [],
      };

      mockTasksService.findOne.mockResolvedValue(mockTask);

      const result = await controller.findOne('123');

      expect(result).toEqual(mockTask);
      expect(service.findOne).toHaveBeenCalledWith('123');
    });
  });

  describe('retry', () => {
    it('should retry a failed task', async () => {
      const mockResult = {
        id: '123',
        status: 'analyzing',
      };

      mockTasksService.retry.mockResolvedValue(mockResult);

      const result = await controller.retry('123');

      expect(result).toEqual(mockResult);
      expect(service.retry).toHaveBeenCalledWith('123');
    });
  });

  describe('cancel', () => {
    it('should cancel a task', async () => {
      const mockResult = {
        message: 'Task cancelled successfully',
      };

      mockTasksService.cancel.mockResolvedValue(mockResult);

      const result = await controller.cancel('123');

      expect(result).toEqual(mockResult);
      expect(service.cancel).toHaveBeenCalledWith('123');
    });
  });
});
