import { Injectable } from '@nestjs/common';
import { IGitHubService } from '../common/interfaces/github.service.interface';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { GitHubIssuesService } from './github-issues.service';

/**
 * Adapter service that implements IGitHubService interface
 * and delegates to the actual GitHubIssuesService
 */
@Injectable()
export class GitHubServiceAdapter implements IGitHubService {
  constructor(private readonly gitHubIssuesService: GitHubIssuesService) {}

  async createIssue(
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
  }> {
    // Build clarificationQA from questions and answers
    const clarificationQA =
      task.clarificationQuestions && task.clarificationAnswers
        ? task.clarificationQuestions.map((question, index) => ({
            question,
            answer: task.clarificationAnswers?.[index] || '',
          }))
        : undefined;

    // Delegate to the real GitHubIssuesService
    return this.gitHubIssuesService.createIssue({
      taskId: task.id,
      source: 'api', // Default source
      description: task.description,
      analysis: {
        ...analysis,
        repo: task.repo, // Use repo from task, not analysis
      },
      clarificationQA,
    });
  }
}
