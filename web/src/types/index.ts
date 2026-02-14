export interface Task {
  id: string;
  source: string;
  status: TaskStatus;
  description: string;
  task_type_hint?: string;
  repo: string;
  files_hint?: string;
  acceptance_criteria?: string;
  priority: string;
  llm_analysis?: any;
  llm_summary?: string;
  task_type?: string;
  recommended_agent?: string;
  likely_files?: string[];
  suggested_criteria?: string[];
  clarification_questions?: string[];
  clarification_answers?: string[];
  is_clarified: boolean;
  github_issue_number?: number;
  github_issue_url?: string;
  github_pr_number?: number;
  github_pr_url?: string;
  github_pr_status?: string;
  github_branch?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  dispatched_at?: string;
  completed_at?: string;
  error_message?: string;
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
  task_id: string;
  event_type: string;
  payload?: any;
  created_at: string;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
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
