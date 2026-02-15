export interface StatsMetrics {
  period: {
    from: string;
    to: string;
    label: string;
  };
  filters: {
    repo: string;
    agent: string;
    taskType: string;
    status: string;
  };
  volume: {
    tasksCreated: number;
    tasksDispatched: number;
    tasksMerged: number;
    tasksFailed: number;
    tasksInProgress: number;
  };
  quality: {
    successRate: number;
    failureRate: number;
    clarificationRate: number;
  };
  performance: {
    avgTimeToPr: number;
    medianTimeToPr: number;
    p95TimeToPr: number;
    avgTimeToMerge: number;
    medianTimeToMerge: number;
    p95TimeToMerge: number;
  };
  breakdown: {
    byStatus: Record<string, number>;
    byTaskType: Record<string, number>;
    byAgent: Record<string, number>;
    byRepo: Record<string, number>;
  };
  trends: {
    completionTrend: number;
    successRateTrend: number;
    avgTimeToPrTrend: number;
  };
  cached: boolean;
  cachedAt?: string;
  expiresAt?: string;
}

export interface DailyVolumeData {
  date: string;
  tasksCreated: number;
  tasksMerged: number;
  tasksFailed: number;
}

export interface AgentPerformance {
  name: string;
  totalTasks: number;
  mergedCount: number;
  failedCount: number;
  successRate: number;
  avgTimeToPr: number;
  avgTimeToMerge: number;
  taskBreakdown: {
    [taskType: string]: {
      total: number;
      merged: number;
      successRate: number;
    };
  };
}

export interface UserActivity {
  userId: string;
  tasksCreated: number;
  tasksMerged: number;
  tasksFailed: number;
  successRate: number;
  avgTimeToPr: number;
  agentDistribution: Record<string, number>;
}

export interface TaskFailure {
  taskId: string;
  description: string;
  failureReason: string;
  failedAt: string;
  status: string;
  errorMessage: string;
  githubIssueUrl?: string;
}
