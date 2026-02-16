import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Task, TaskDocument } from '../common/schemas/task.schema';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { DependencyResponseDto, DependencyStatusDto } from './dto/dependency-response.dto';

@Injectable()
export class DependenciesService {
  constructor(
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
  ) {}

  /**
   * Add a dependency to a task
   */
  async addDependency(taskId: string, dto: AddDependencyDto): Promise<Task> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Validate dependency exists (if task dependency)
    if (dto.type === 'task') {
      if (!dto.taskId) {
        throw new BadRequestException('taskId is required for task dependency');
      }

      // Check if dependency task exists
      const dependencyTask = await this.taskModel.findById(dto.taskId).exec();
      if (!dependencyTask) {
        throw new NotFoundException(`Dependency task ${dto.taskId} not found`);
      }

      // Check for circular dependency
      const hasCycle = await this.detectCycle(taskId, dto.taskId);
      if (hasCycle) {
        throw new BadRequestException(
          'Circular dependency detected. Cannot add this dependency.',
        );
      }

      // Check if dependency already exists
      const existingDep = task.dependencies.find(
        d => d.type === 'task' && d.taskId === dto.taskId,
      );
      if (existingDep) {
        throw new ConflictException('This dependency already exists');
      }
    }

    // Validate PR dependency
    if (dto.type === 'pr') {
      if (!dto.repo || !dto.prNumber) {
        throw new BadRequestException('repo and prNumber are required for PR dependency');
      }
      // Check if dependency already exists
      const existingDep = task.dependencies.find(
        d => d.type === 'pr' && d.repo === dto.repo && d.prNumber === dto.prNumber,
      );
      if (existingDep) {
        throw new ConflictException('This dependency already exists');
      }
    }

    // Validate external issue dependency
    if (dto.type === 'external_issue') {
      if (!dto.externalRepo || !dto.externalIssueNumber) {
        throw new BadRequestException(
          'externalRepo and externalIssueNumber are required for external issue dependency',
        );
      }
      // Check if dependency already exists
      const existingDep = task.dependencies.find(
        d =>
          d.type === 'external_issue' &&
          d.externalRepo === dto.externalRepo &&
          d.externalIssueNumber === dto.externalIssueNumber,
      );
      if (existingDep) {
        throw new ConflictException('This dependency already exists');
      }
    }

    // Create dependency object
    const dependency: any = {
      id: new Types.ObjectId().toString(),
      type: dto.type,
      requiredStatus: dto.requiredStatus || (dto.type === 'external_issue' ? 'closed' : 'merged'),
      blockingBehavior: dto.blockingBehavior || 'hard',
      currentState: 'pending',
    };

    if (dto.type === 'task') {
      dependency.taskId = dto.taskId;
    } else if (dto.type === 'pr') {
      dependency.repo = dto.repo;
      dependency.prNumber = dto.prNumber;
    } else if (dto.type === 'external_issue') {
      dependency.externalRepo = dto.externalRepo;
      dependency.externalIssueNumber = dto.externalIssueNumber;
    }

    // Add dependency
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        $push: { dependencies: dependency },
        $set: {
          dependencyStatus: 'pending',
          autoStartOnDependency: dto.autoStart || false,
        },
      },
      { new: true },
    ).exec();

    // Update blockedBy array
    await this.updateBlockedBy(taskId);

    // Add event
    await this.taskModel.findByIdAndUpdate(taskId, {
      $push: {
        events: {
          eventType: 'dependency_added',
          payload: { dependency },
          createdAt: new Date(),
        },
      },
    }).exec();

    return updatedTask!;
  }

  /**
   * Remove a dependency from a task
   */
  async removeDependency(taskId: string, dependencyId: string): Promise<Task> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const dependencyIndex = task.dependencies.findIndex(d => d.id === dependencyId);
    if (dependencyIndex === -1) {
      throw new NotFoundException('Dependency not found');
    }

    // Remove dependency
    const updatedTask = await this.taskModel.findByIdAndUpdate(
      taskId,
      {
        $pull: { dependencies: { id: dependencyId } },
      },
      { new: true },
    ).exec();

    // Update blockedBy and dependencyStatus
    await this.updateBlockedBy(taskId);
    await this.updateDependencyStatus(taskId);

    // Add event
    await this.taskModel.findByIdAndUpdate(taskId, {
      $push: {
        events: {
          eventType: 'dependency_removed',
          payload: { dependencyId },
          createdAt: new Date(),
        },
      },
    }).exec();

    return updatedTask!;
  }

  /**
   * Get all dependencies for a task with enriched data
   */
  async getDependencies(taskId: string): Promise<DependencyStatusDto> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const enrichedDependencies: DependencyResponseDto[] = [];

    for (const dep of task.dependencies) {
      const enriched: DependencyResponseDto = {
        id: dep.id,
        type: dep.type,
        requiredStatus: dep.requiredStatus,
        blockingBehavior: dep.blockingBehavior,
        currentState: dep.currentState,
        resolvedAt: dep.resolvedAt,
        failureReason: dep.failureReason,
      };

      if (dep.type === 'task' && dep.taskId) {
        const depTask = await this.taskModel.findById(dep.taskId).exec();
        if (depTask) {
          enriched.taskId = dep.taskId;
          enriched.taskTitle = depTask.llmSummary || depTask.description.substring(0, 100);
          enriched.taskStatus = depTask.status;
        }
      } else if (dep.type === 'pr') {
        enriched.repo = dep.repo;
        enriched.prNumber = dep.prNumber;
      } else if (dep.type === 'external_issue') {
        enriched.externalRepo = dep.externalRepo;
        enriched.externalIssueNumber = dep.externalIssueNumber;
      }

      enrichedDependencies.push(enriched);
    }

    const canStart = await this.canTaskStart(taskId);

    return {
      taskId,
      dependencyStatus: task.dependencyStatus,
      dependencies: enrichedDependencies,
      canStart,
      blockedBy: task.blockedBy,
    };
  }

  /**
   * Get all tasks that depend on this task (dependents)
   */
  async getDependents(taskId: string): Promise<Task[]> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const dependents = await this.taskModel
      .find({
        dependencies: { $elemMatch: { type: 'task', taskId: taskId } },
      })
      .exec();

    return dependents;
  }

  /**
   * Check if a task can start (no hard blockers)
   */
  async canTaskStart(taskId: string): Promise<boolean> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return false;
    }

    const hardBlockers = task.dependencies.filter(
      d => d.blockingBehavior === 'hard' && d.currentState !== 'resolved',
    );

    return hardBlockers.length === 0;
  }

  /**
   * Update blockedBy array based on current dependencies
   */
  async updateBlockedBy(taskId: string): Promise<void> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return;
    }

    const blockedBy = task.dependencies
      .filter(d => d.blockingBehavior === 'hard' && d.currentState !== 'resolved')
      .map(d => d.id);

    await this.taskModel.findByIdAndUpdate(taskId, {
      $set: { blockedBy },
    }).exec();
  }

  /**
   * Update dependency status based on current state
   */
  async updateDependencyStatus(taskId: string): Promise<void> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      return;
    }

    const canStart = await this.canTaskStart(taskId);
    const hasBlockedDep = task.dependencies.some(d => d.currentState === 'blocked');

    let newStatus: 'pending' | 'ready' | 'blocked';
    if (hasBlockedDep) {
      newStatus = 'blocked';
    } else if (canStart) {
      newStatus = 'ready';
    } else {
      newStatus = 'pending';
    }

    if (task.dependencyStatus !== newStatus) {
      await this.taskModel.findByIdAndUpdate(taskId, {
        $set: { dependencyStatus: newStatus },
      }).exec();

      // Add event
      await this.taskModel.findByIdAndUpdate(taskId, {
        $push: {
          events: {
            eventType: 'dependency_status_changed',
            payload: { oldStatus: task.dependencyStatus, newStatus },
            createdAt: new Date(),
          },
        },
      }).exec();
    }
  }

  /**
   * Detect circular dependencies using DFS
   */
  async detectCycle(taskId: string, dependsOnTaskId: string): Promise<boolean> {
    const visited = new Set<string>();

    const hasCycle = async (currentId: string): Promise<boolean> => {
      if (currentId === taskId) {
        return true; // Found a cycle!
      }
      if (visited.has(currentId)) {
        return false; // Already checked this path
      }

      visited.add(currentId);

      // Find all tasks that currentId depends on
      const currentTask = await this.taskModel.findById(currentId).exec();
      if (!currentTask) {
        return false;
      }

      for (const dep of currentTask.dependencies) {
        if (dep.type === 'task' && dep.taskId) {
          if (await hasCycle(dep.taskId)) {
            return true;
          }
        }
      }

      return false;
    };

    return hasCycle(dependsOnTaskId);
  }

  /**
   * Mark a dependency as resolved (called when a task completes or PR merges)
   */
  async resolveDependency(
    taskId: string,
    dependencyId: string,
  ): Promise<void> {
    await this.taskModel.findOneAndUpdate(
      { _id: taskId, 'dependencies.id': dependencyId },
      {
        $set: {
          'dependencies.$.currentState': 'resolved',
          'dependencies.$.resolvedAt': new Date(),
        },
      },
    ).exec();

    // Update task dependency status
    await this.updateBlockedBy(taskId);
    await this.updateDependencyStatus(taskId);

    // Add event
    await this.taskModel.findByIdAndUpdate(taskId, {
      $push: {
        events: {
          eventType: 'dependency_resolved',
          payload: { dependencyId },
          createdAt: new Date(),
        },
      },
    }).exec();
  }

  /**
   * Check and resolve task dependencies when a task status changes
   */
  async checkTaskDependencies(taskId: string, newStatus: string): Promise<void> {
    // Find all tasks that depend on this task
    const dependents = await this.taskModel
      .find({
        dependencies: { $elemMatch: { type: 'task', taskId: taskId } },
      })
      .exec();

    for (const dependent of dependents) {
      const dependency = dependent.dependencies.find(
        d => d.type === 'task' && d.taskId === taskId,
      );

      if (!dependency) continue;

      // Check if the required status matches
      const statusMap: Record<string, string[]> = {
        merged: ['merged'],
        completed: ['merged'],
        dispatched: ['dispatched', 'coding', 'pr_open', 'merged'],
      };

      const acceptableStatuses = statusMap[dependency.requiredStatus] || ['merged'];

      if (acceptableStatuses.includes(newStatus)) {
        // Resolve the dependency
        await this.resolveDependency(dependent._id.toString(), dependency.id);

        // Check if all dependencies are resolved and auto-start if enabled
        const canStart = await this.canTaskStart(dependent._id.toString());
        if (canStart && dependent.autoStartOnDependency) {
          // TODO: Trigger auto-start (dispatch the task)
          // This would call tasksService.dispatchTask() but we need to avoid circular dependency
          console.log(`Task ${dependent._id} is ready for auto-start`);
        }
      }
    }
  }
}
