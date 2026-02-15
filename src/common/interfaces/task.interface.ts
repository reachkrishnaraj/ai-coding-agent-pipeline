export interface TaskInput {
  description: string;
  task_type_hint?: string;
  repo: string;
  files_hint?: string[];
  acceptance_criteria?: string;
  priority?: string;
}

export interface ClarificationQA {
  question: string;
  answer: string;
}
