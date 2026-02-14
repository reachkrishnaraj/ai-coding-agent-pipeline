export interface LlmAnalysis {
  clear_enough: boolean;
  questions?: string[];
  task_type: 'bug-fix' | 'feature' | 'refactor' | 'test-coverage';
  recommended_agent: 'claude-code' | 'codex' | 'copilot';
  summary: string;
  suggested_acceptance_criteria?: string[];
  likely_files?: string[];
  repo: string;
}
