import { LlmAnalysis } from './llm-analysis.interface';
import { ClarificationQA } from './task.interface';

export interface ILlmService {
  analyzeTask(task: {
    description: string;
    task_type_hint?: string;
    repo?: string;
    files_hint?: string[];
    acceptance_criteria?: string;
    clarificationQA?: ClarificationQA[];
  }): Promise<LlmAnalysis>;
}
