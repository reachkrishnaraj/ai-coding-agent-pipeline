import { Injectable } from '@nestjs/common';
import { IGitHubService } from '../interfaces/github.service.interface';
import { LlmAnalysis } from '../interfaces/llm-analysis.interface';

@Injectable()
export class GitHubServiceMock implements IGitHubService {
  async createIssue(
    task: {
      id: string;
      description: string;
      repo: string;
    },
    analysis: LlmAnalysis,
  ): Promise<{
    issueNumber: number;
    issueUrl: string;
    htmlUrl: string;
  }> {
    // Mock implementation for testing
    const issueNumber = Math.floor(Math.random() * 1000) + 1;
    const [owner, repo] = task.repo.split('/');

    return {
      issueNumber,
      issueUrl: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      htmlUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
    };
  }
}
