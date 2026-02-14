import { LlmAnalysis } from './llm-analysis.interface';

export interface IGitHubService {
  createIssue(
    task: {
      id: string;
      description: string;
      repo: string;
      acceptance_criteria?: string;
      clarificationQuestions?: string[];
      clarificationAnswers?: string[];
    },
    analysis: LlmAnalysis,
  ): Promise<{
    issueNumber: number;
    issueUrl: string;
    htmlUrl: string;
  }>;
}
