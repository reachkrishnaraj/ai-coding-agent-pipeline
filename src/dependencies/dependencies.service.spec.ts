import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DependenciesService } from './dependencies.service';
import { Task } from '../common/schemas/task.schema';

describe('DependenciesService', () => {
  let service: DependenciesService;

  const mockTaskModel = {
    findById: jest.fn().mockReturnThis(),
    findByIdAndUpdate: jest.fn().mockReturnThis(),
    findByIdAndDelete: jest.fn().mockReturnThis(),
    findOneAndUpdate: jest.fn().mockReturnThis(),
    find: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DependenciesService,
        {
          provide: getModelToken(Task.name),
          useValue: mockTaskModel,
        },
      ],
    }).compile();

    service = module.get<DependenciesService>(DependenciesService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addDependency', () => {
    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await expect(
        service.addDependency('task-123', {
          type: 'task',
          taskId: 'dep-task-456',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when taskId missing for task dependency', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      await expect(
        service.addDependency('task-123', {
          type: 'task',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when dependency task does not exist', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        .mockResolvedValueOnce(null); // findById for dependency task

      await expect(
        service.addDependency('task-123', {
          type: 'task',
          taskId: 'nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when circular dependency detected', async () => {
      const mainTask = {
        _id: 'task-A',
        dependencies: [],
      };

      const depTask = {
        _id: 'task-B',
        dependencies: [
          { type: 'task', taskId: 'task-A' },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mainTask) // findById for main task
        .mockResolvedValueOnce(depTask) // findById for dependency task (exists check)
        .mockResolvedValueOnce(depTask); // findById in detectCycle: task-B depends on task-A

      await expect(
        service.addDependency('task-A', {
          type: 'task',
          taskId: 'task-B',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when task dependency already exists', async () => {
      const mainTask = {
        _id: 'task-123',
        dependencies: [
          { type: 'task', taskId: 'dep-task-456' },
        ],
      };

      const depTask = {
        _id: 'dep-task-456',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mainTask) // findById for main task
        .mockResolvedValueOnce(depTask) // findById for dependency task (exists check)
        .mockResolvedValueOnce(null); // detectCycle: dep-task-456 has no deps leading to cycle

      await expect(
        service.addDependency('task-123', {
          type: 'task',
          taskId: 'dep-task-456',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should add a task dependency successfully', async () => {
      const mainTask = {
        _id: 'task-123',
        dependencies: [],
      };

      const depTask = {
        _id: 'dep-task-456',
        dependencies: [],
      };

      const updatedTask = {
        _id: 'task-123',
        status: 'received',
        dependencyStatus: 'pending',
        dependencies: [
          {
            id: 'some-id',
            type: 'task',
            taskId: 'dep-task-456',
            requiredStatus: 'merged',
            blockingBehavior: 'hard',
            currentState: 'pending',
          },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mainTask) // findById for main task
        .mockResolvedValueOnce(depTask) // findById for dependency task (exists check)
        .mockResolvedValueOnce(null) // detectCycle: dep-task-456 has no deps that lead back
        .mockResolvedValueOnce(updatedTask) // findByIdAndUpdate (add dependency)
        // updateBlockedBy calls
        .mockResolvedValueOnce({
          ...updatedTask,
          dependencies: [
            { id: 'some-id', blockingBehavior: 'hard', currentState: 'pending' },
          ],
        }) // findById in updateBlockedBy
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate in updateBlockedBy
        // event push
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate (add event)

      const result = await service.addDependency('task-123', {
        type: 'task',
        taskId: 'dep-task-456',
      });

      expect(result).toEqual(updatedTask);
    });

    it('should throw BadRequestException when repo and prNumber missing for PR dependency', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      await expect(
        service.addDependency('task-123', {
          type: 'pr',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when PR dependency already exists', async () => {
      const mainTask = {
        _id: 'task-123',
        dependencies: [
          { type: 'pr', repo: 'mothership/api', prNumber: 42 },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mainTask);

      await expect(
        service.addDependency('task-123', {
          type: 'pr',
          repo: 'mothership/api',
          prNumber: 42,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when external issue fields missing', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      await expect(
        service.addDependency('task-123', {
          type: 'external_issue',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException when external issue dependency already exists', async () => {
      const mainTask = {
        _id: 'task-123',
        dependencies: [
          {
            type: 'external_issue',
            externalRepo: 'org/repo',
            externalIssueNumber: 99,
          },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mainTask);

      await expect(
        service.addDependency('task-123', {
          type: 'external_issue',
          externalRepo: 'org/repo',
          externalIssueNumber: 99,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('removeDependency', () => {
    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await expect(
        service.removeDependency('task-123', 'dep-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when dependency not found', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [{ id: 'dep-other' }],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      await expect(
        service.removeDependency('task-123', 'dep-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should remove a dependency successfully', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [{ id: 'dep-1', type: 'task', taskId: 'dep-task-456' }],
      };

      const updatedTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        .mockResolvedValueOnce(updatedTask) // findByIdAndUpdate ($pull)
        // updateBlockedBy
        .mockResolvedValueOnce({ ...updatedTask, dependencies: [] }) // findById
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set blockedBy)
        // updateDependencyStatus
        .mockResolvedValueOnce({
          _id: 'task-123',
          dependencies: [],
          dependencyStatus: 'pending',
        }) // findById
        // canTaskStart (called by updateDependencyStatus)
        .mockResolvedValueOnce({ _id: 'task-123', dependencies: [] }) // findById in canTaskStart
        // updateDependencyStatus updates if status changed
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set dependencyStatus)
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (push event)
        // add event for removal
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate (push event)

      const result = await service.removeDependency('task-123', 'dep-1');

      expect(result).toEqual(updatedTask);
    });
  });

  describe('getDependencies', () => {
    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await expect(service.getDependencies('task-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return enriched dependencies for task type', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencyStatus: 'pending',
        blockedBy: ['dep-1'],
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

      const depTask = {
        _id: 'dep-task-456',
        llmSummary: 'Fix payment processing',
        description: 'Full description here',
        status: 'dispatched',
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        .mockResolvedValueOnce(depTask) // findById for dependency task enrichment
        // canTaskStart
        .mockResolvedValueOnce(mockTask); // findById in canTaskStart

      const result = await service.getDependencies('task-123');

      expect(result.taskId).toBe('task-123');
      expect(result.dependencyStatus).toBe('pending');
      expect(result.canStart).toBe(false);
      expect(result.blockedBy).toEqual(['dep-1']);
      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].taskTitle).toBe('Fix payment processing');
      expect(result.dependencies[0].taskStatus).toBe('dispatched');
    });

    it('should return enriched dependencies for pr type', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencyStatus: 'pending',
        blockedBy: [],
        dependencies: [
          {
            id: 'dep-2',
            type: 'pr',
            repo: 'mothership/api',
            prNumber: 42,
            requiredStatus: 'merged',
            blockingBehavior: 'soft',
            currentState: 'pending',
          },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        // canTaskStart
        .mockResolvedValueOnce(mockTask); // findById in canTaskStart

      const result = await service.getDependencies('task-123');

      expect(result.dependencies[0].repo).toBe('mothership/api');
      expect(result.dependencies[0].prNumber).toBe(42);
    });

    it('should return enriched dependencies for external_issue type', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencyStatus: 'pending',
        blockedBy: [],
        dependencies: [
          {
            id: 'dep-3',
            type: 'external_issue',
            externalRepo: 'org/repo',
            externalIssueNumber: 99,
            requiredStatus: 'closed',
            blockingBehavior: 'hard',
            currentState: 'pending',
          },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        // canTaskStart
        .mockResolvedValueOnce(mockTask); // findById in canTaskStart

      const result = await service.getDependencies('task-123');

      expect(result.dependencies[0].externalRepo).toBe('org/repo');
      expect(result.dependencies[0].externalIssueNumber).toBe(99);
    });
  });

  describe('getDependents', () => {
    it('should throw NotFoundException when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await expect(service.getDependents('task-123')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return tasks that depend on this task', async () => {
      const mockTask = { _id: 'task-123' };
      const mockDependents = [
        { _id: 'task-789', description: 'Depends on task-123' },
        { _id: 'task-101', description: 'Also depends on task-123' },
      ];

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById for main task
        .mockResolvedValueOnce(mockDependents); // find dependents

      const result = await service.getDependents('task-123');

      expect(result).toEqual(mockDependents);
      expect(result).toHaveLength(2);
    });
  });

  describe('canTaskStart', () => {
    it('should return false when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      const result = await service.canTaskStart('task-123');

      expect(result).toBe(false);
    });

    it('should return true when no hard blockers exist', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { blockingBehavior: 'soft', currentState: 'pending' },
          { blockingBehavior: 'hard', currentState: 'resolved' },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      const result = await service.canTaskStart('task-123');

      expect(result).toBe(true);
    });

    it('should return false when hard blockers exist', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { blockingBehavior: 'hard', currentState: 'pending' },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      const result = await service.canTaskStart('task-123');

      expect(result).toBe(false);
    });

    it('should return true when no dependencies exist', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(mockTask);

      const result = await service.canTaskStart('task-123');

      expect(result).toBe(true);
    });
  });

  describe('updateBlockedBy', () => {
    it('should do nothing when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await service.updateBlockedBy('task-123');

      expect(mockTaskModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should update blockedBy with unresolved hard dependencies', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { id: 'dep-1', blockingBehavior: 'hard', currentState: 'pending' },
          { id: 'dep-2', blockingBehavior: 'soft', currentState: 'pending' },
          { id: 'dep-3', blockingBehavior: 'hard', currentState: 'resolved' },
        ],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate

      await service.updateBlockedBy('task-123');

      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalledWith('task-123', {
        $set: { blockedBy: ['dep-1'] },
      });
    });
  });

  describe('updateDependencyStatus', () => {
    it('should do nothing when task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      await service.updateDependencyStatus('task-123');

      expect(mockTaskModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('should set status to ready when canTaskStart returns true and no blocked deps', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { blockingBehavior: 'hard', currentState: 'resolved' },
        ],
        dependencyStatus: 'pending',
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById in updateDependencyStatus
        .mockResolvedValueOnce(mockTask) // findById in canTaskStart
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set dependencyStatus)
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate (push event)

      await service.updateDependencyStatus('task-123');

      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'task-123',
        { $set: { dependencyStatus: 'ready' } },
      );
    });

    it('should set status to blocked when any dep is blocked', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { blockingBehavior: 'hard', currentState: 'blocked' },
        ],
        dependencyStatus: 'pending',
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById in updateDependencyStatus
        .mockResolvedValueOnce(mockTask) // findById in canTaskStart
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate (push event)

      await service.updateDependencyStatus('task-123');

      expect(mockTaskModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'task-123',
        { $set: { dependencyStatus: 'blocked' } },
      );
    });

    it('should not update when status has not changed', async () => {
      const mockTask = {
        _id: 'task-123',
        dependencies: [
          { blockingBehavior: 'hard', currentState: 'pending' },
        ],
        dependencyStatus: 'pending',
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(mockTask) // findById in updateDependencyStatus
        .mockResolvedValueOnce(mockTask); // findById in canTaskStart

      await service.updateDependencyStatus('task-123');

      // Should not call findByIdAndUpdate since status hasn't changed
      expect(mockTaskModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('detectCycle', () => {
    it('should return true when cycle exists', async () => {
      // task-A depends on task-B, and we want to add task-B depends on task-A
      const taskB = {
        _id: 'task-B',
        dependencies: [{ type: 'task', taskId: 'task-A' }],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(taskB); // findById for task-B in detectCycle

      const result = await service.detectCycle('task-A', 'task-B');

      expect(result).toBe(true);
    });

    it('should return false when no cycle exists', async () => {
      const taskB = {
        _id: 'task-B',
        dependencies: [{ type: 'task', taskId: 'task-C' }],
      };

      const taskC = {
        _id: 'task-C',
        dependencies: [],
      };

      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(taskB) // findById for task-B
        .mockResolvedValueOnce(taskC); // findById for task-C

      const result = await service.detectCycle('task-A', 'task-B');

      expect(result).toBe(false);
    });

    it('should return false when dependency task not found', async () => {
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce(null);

      const result = await service.detectCycle('task-A', 'task-B');

      expect(result).toBe(false);
    });
  });

  describe('resolveDependency', () => {
    it('should resolve a dependency and update status', async () => {
      const resolvedTask = {
        _id: 'task-123',
        dependencies: [
          { id: 'dep-1', blockingBehavior: 'hard', currentState: 'resolved' },
        ],
        dependencyStatus: 'pending',
      };

      mockTaskModel.findOneAndUpdate.mockReturnThis();
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce(undefined) // findOneAndUpdate (resolve dep)
        // updateBlockedBy
        .mockResolvedValueOnce(resolvedTask) // findById
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set blockedBy)
        // updateDependencyStatus
        .mockResolvedValueOnce(resolvedTask) // findById
        .mockResolvedValueOnce(resolvedTask) // findById in canTaskStart
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set dependencyStatus)
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (push event for status change)
        // add event for resolution
        .mockResolvedValueOnce(undefined); // findByIdAndUpdate (push event)

      await service.resolveDependency('task-123', 'dep-1');

      expect(mockTaskModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'task-123', 'dependencies.id': 'dep-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            'dependencies.$.currentState': 'resolved',
          }),
        }),
      );
    });
  });

  describe('checkTaskDependencies', () => {
    it('should resolve dependency when status matches', async () => {
      const dependent = {
        _id: { toString: () => 'task-789' },
        dependencies: [
          {
            type: 'task',
            taskId: 'task-123',
            id: 'dep-1',
            requiredStatus: 'merged',
          },
        ],
        autoStartOnDependency: false,
      };

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.findOneAndUpdate.mockReturnThis();
      mockTaskModel.findById.mockReturnThis();
      mockTaskModel.findByIdAndUpdate.mockReturnThis();
      mockTaskModel.exec
        .mockResolvedValueOnce([dependent]) // find dependents
        // resolveDependency internals
        .mockResolvedValueOnce(undefined) // findOneAndUpdate
        // updateBlockedBy
        .mockResolvedValueOnce({
          _id: 'task-789',
          dependencies: [
            { id: 'dep-1', blockingBehavior: 'hard', currentState: 'resolved' },
          ],
          dependencyStatus: 'pending',
        }) // findById
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate
        // updateDependencyStatus
        .mockResolvedValueOnce({
          _id: 'task-789',
          dependencies: [
            { id: 'dep-1', blockingBehavior: 'hard', currentState: 'resolved' },
          ],
          dependencyStatus: 'pending',
        }) // findById
        .mockResolvedValueOnce({
          _id: 'task-789',
          dependencies: [
            { id: 'dep-1', blockingBehavior: 'hard', currentState: 'resolved' },
          ],
        }) // findById in canTaskStart
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (set dependencyStatus)
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (push event)
        // resolveDependency event push
        .mockResolvedValueOnce(undefined) // findByIdAndUpdate (push event)
        // canTaskStart in checkTaskDependencies
        .mockResolvedValueOnce({
          _id: 'task-789',
          dependencies: [
            { id: 'dep-1', blockingBehavior: 'hard', currentState: 'resolved' },
          ],
        }); // findById

      await service.checkTaskDependencies('task-123', 'merged');

      expect(mockTaskModel.find).toHaveBeenCalledWith({
        dependencies: { $elemMatch: { type: 'task', taskId: 'task-123' } },
      });
    });

    it('should not resolve dependency when status does not match', async () => {
      const dependent = {
        _id: { toString: () => 'task-789' },
        dependencies: [
          {
            type: 'task',
            taskId: 'task-123',
            id: 'dep-1',
            requiredStatus: 'merged',
          },
        ],
        autoStartOnDependency: false,
      };

      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce([dependent]);

      await service.checkTaskDependencies('task-123', 'received');

      // findOneAndUpdate should not have been called since 'received' doesn't match 'merged'
      expect(mockTaskModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should handle no dependents', async () => {
      mockTaskModel.find.mockReturnThis();
      mockTaskModel.exec.mockResolvedValueOnce([]);

      await service.checkTaskDependencies('task-123', 'merged');

      expect(mockTaskModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
