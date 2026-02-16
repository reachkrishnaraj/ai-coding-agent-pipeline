export interface DependencyResponseDto {
  id: string;
  type: 'task' | 'pr' | 'external_issue';
  taskId?: string;
  taskTitle?: string;
  taskStatus?: string;
  repo?: string;
  prNumber?: number;
  externalRepo?: string;
  externalIssueNumber?: number;
  requiredStatus: string;
  blockingBehavior: 'hard' | 'soft';
  currentState: 'pending' | 'ready' | 'blocked' | 'resolved' | 'failed';
  resolvedAt?: Date;
  failureReason?: string;
}

export interface DependencyStatusDto {
  taskId: string;
  dependencyStatus: 'pending' | 'ready' | 'blocked';
  dependencies: DependencyResponseDto[];
  canStart: boolean;
  blockedBy: string[];
}
