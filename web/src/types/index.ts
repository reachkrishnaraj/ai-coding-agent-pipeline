export interface Task {
  id: string;
  source: string;
  status: TaskStatus;
  description: string;
  taskTypeHint?: string;
  repo: string;
  filesHint?: string[];
  acceptanceCriteria?: string;
  priority: string;
  llmAnalysis?: any;
  llmSummary?: string;
  taskType?: string;
  recommendedAgent?: string;
  likelyFiles?: string[];
  suggestedCriteria?: string[];
  clarificationQuestions?: string[];
  clarificationAnswers?: string[];
  isClarified: boolean;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  githubPrNumber?: number;
  githubPrUrl?: string;
  githubPrStatus?: string;
  githubBranch?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  events?: TaskEvent[];
}

export type TaskStatus =
  | 'received'
  | 'analyzing'
  | 'needs_clarification'
  | 'dispatched'
  | 'coding'
  | 'pr_open'
  | 'merged'
  | 'failed';

export interface TaskEvent {
  id: string;
  eventType: string;
  payload?: any;
  createdAt: string;
}

export type UserRole = 'admin' | 'developer';
export type UserStatus = 'pending' | 'active' | 'inactive';

export interface User {
  id: string;
  githubId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  status: UserStatus;
}

export interface AuthResponse {
  authenticated: boolean;
  user?: User;
}

export interface CreateTaskDto {
  description: string;
  type?: string;
  repo?: string;
  files?: string[];
  acceptanceCriteria?: string;
  priority?: string;
  recommended_agent?: string;
}

export interface CreateTaskResponse {
  id: string;
  status: TaskStatus;
  message?: string;
  issue_url?: string;
  issue_number?: number;
  title?: string;
  agent?: string;
  task_type?: string;
  questions?: string[];
}

export interface ClarifyTaskDto {
  answers: string[];
}

export interface UpdateUserDto {
  role?: UserRole;
  status?: UserStatus;
}
