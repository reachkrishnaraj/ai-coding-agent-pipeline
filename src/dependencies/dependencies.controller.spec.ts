import { Test, TestingModule } from '@nestjs/testing';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';

describe('DependenciesController', () => {
  let controller: DependenciesController;
  let service: DependenciesService;

  const mockDependenciesService = {
    addDependency: jest.fn(),
    removeDependency: jest.fn(),
    getDependencies: jest.fn(),
    getDependents: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DependenciesController],
      providers: [
        {
          provide: DependenciesService,
          useValue: mockDependenciesService,
        },
      ],
    }).compile();

    controller = module.get<DependenciesController>(DependenciesController);
    service = module.get<DependenciesService>(DependenciesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('addDependency', () => {
    it('should add a task dependency and return formatted response', async () => {
      const dto = {
        type: 'task' as const,
        taskId: 'dep-task-456',
        blockingBehavior: 'hard' as const,
      };

      const mockTask = {
        _id: { toString: () => 'task-123' },
        status: 'received',
        dependencyStatus: 'pending',
        dependencies: [
          {
            id: 'dep-1',
            type: 'task',
            taskId: 'dep-task-456',
            requiredStatus: 'merged',
            blockingBehavior: 'hard',
            currentState: 'pending',
          },
        ],
      };

      mockDependenciesService.addDependency.mockResolvedValue(mockTask);

      const result = await controller.addDependency('task-123', dto);

      expect(result).toEqual({
        id: 'task-123',
        status: 'received',
        dependencyStatus: 'pending',
        dependencies: mockTask.dependencies,
      });
      expect(service.addDependency).toHaveBeenCalledWith('task-123', dto);
    });

    it('should add a PR dependency', async () => {
      const dto = {
        type: 'pr' as const,
        repo: 'mothership/finance-service',
        prNumber: 42,
      };

      const mockTask = {
        _id: { toString: () => 'task-123' },
        status: 'received',
        dependencyStatus: 'pending',
        dependencies: [
          {
            id: 'dep-2',
            type: 'pr',
            repo: 'mothership/finance-service',
            prNumber: 42,
            requiredStatus: 'merged',
            blockingBehavior: 'hard',
            currentState: 'pending',
          },
        ],
      };

      mockDependenciesService.addDependency.mockResolvedValue(mockTask);

      const result = await controller.addDependency('task-123', dto);

      expect(result.id).toBe('task-123');
      expect(result.dependencies).toHaveLength(1);
      expect(service.addDependency).toHaveBeenCalledWith('task-123', dto);
    });
  });

  describe('removeDependency', () => {
    it('should remove a dependency and return formatted response', async () => {
      const mockTask = {
        _id: { toString: () => 'task-123' },
        dependencies: [],
      };

      mockDependenciesService.removeDependency.mockResolvedValue(mockTask);

      const result = await controller.removeDependency('task-123', 'dep-1');

      expect(result).toEqual({
        id: 'task-123',
        dependencies: [],
      });
      expect(service.removeDependency).toHaveBeenCalledWith('task-123', 'dep-1');
    });
  });

  describe('getDependencies', () => {
    it('should return dependencies for a task', async () => {
      const mockResult = {
        taskId: 'task-123',
        dependencyStatus: 'pending',
        dependencies: [
          {
            id: 'dep-1',
            type: 'task',
            taskId: 'dep-task-456',
            taskTitle: 'Some task',
            taskStatus: 'dispatched',
            requiredStatus: 'merged',
            blockingBehavior: 'hard',
            currentState: 'pending',
          },
        ],
        canStart: false,
        blockedBy: ['dep-1'],
      };

      mockDependenciesService.getDependencies.mockResolvedValue(mockResult);

      const result = await controller.getDependencies('task-123');

      expect(result).toEqual(mockResult);
      expect(service.getDependencies).toHaveBeenCalledWith('task-123');
    });
  });

  describe('getDependents', () => {
    it('should return formatted dependents list', async () => {
      const mockDependents = [
        {
          _id: { toString: () => 'task-789' },
          llmSummary: 'Fix the payment flow',
          description: 'A long description here',
          status: 'received',
          dependencyStatus: 'pending',
        },
        {
          _id: { toString: () => 'task-101' },
          llmSummary: null,
          description:
            'This is a very long description that should be truncated to the first 100 characters if llmSummary is not available',
          status: 'dispatched',
          dependencyStatus: 'ready',
        },
      ];

      mockDependenciesService.getDependents.mockResolvedValue(mockDependents);

      const result = await controller.getDependents('task-123');

      expect(result.taskId).toBe('task-123');
      expect(result.dependents).toHaveLength(2);
      expect(result.dependents[0]).toEqual({
        id: 'task-789',
        title: 'Fix the payment flow',
        status: 'received',
        dependencyStatus: 'pending',
      });
      expect(result.dependents[1].title).toBe(
        'This is a very long description that should be truncated to the first 100 characters if llmSummary i',
      );
      expect(service.getDependents).toHaveBeenCalledWith('task-123');
    });

    it('should return empty dependents list', async () => {
      mockDependenciesService.getDependents.mockResolvedValue([]);

      const result = await controller.getDependents('task-123');

      expect(result.taskId).toBe('task-123');
      expect(result.dependents).toEqual([]);
    });
  });
});
