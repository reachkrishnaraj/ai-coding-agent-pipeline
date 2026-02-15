import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { ClarificationQA } from '../common/interfaces/task.interface';
import {
  generateIssueBody,
  IssueTemplateData,
} from './templates/issue-body.template';

export interface CreateIssueInput {
  taskId: string;
  source: string;
  description: string;
  analysis: LlmAnalysis;
  clarificationQA?: ClarificationQA[];
}

export interface CreateIssueResult {
  issueNumber: number;
  issueUrl: string;
  htmlUrl: string;
}

@Injectable()
export class GitHubIssuesService {
  private readonly logger = new Logger(GitHubIssuesService.name);
  private readonly octokit: Octokit;

  constructor(private readonly configService: ConfigService) {
    const githubToken = this.configService.get<string>('GITHUB_TOKEN');
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN is not configured');
    }

    this.octokit = new Octokit({
      auth: githubToken,
    });
  }

  /**
   * Create a GitHub issue with proper labels and formatting
   */
  async createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
    const { taskId, source, description, analysis, clarificationQA } = input;

    // SECURITY: Validate repo against allowed list (comma-separated prefixes or exact matches)
    // Example: ALLOWED_REPOS="mothership/,reachkrishnaraj/trade-app,myorg/"
    const allowedReposConfig =
      this.configService.get<string>('ALLOWED_REPOS') || 'mothership/';
    const allowedRepos = allowedReposConfig
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const isAllowedRepo = allowedRepos.some(
      (allowed) =>
        analysis.repo === allowed || analysis.repo.startsWith(allowed),
    );

    if (!isAllowedRepo) {
      throw new BadRequestException(
        `Invalid repository: ${analysis.repo}. Allowed: ${allowedRepos.join(', ')}`,
      );
    }

    const [owner, repo] = analysis.repo.split('/');

    // Build labels
    const labels = this.buildLabels(analysis);

    // Generate issue body with pipeline URL for 2-way navigation
    const pipelineUrl = this.configService.get<string>('APP_URL');
    const body = generateIssueBody({
      taskId,
      source,
      description,
      analysis,
      clarificationQA,
      pipelineUrl,
    });

    try {
      this.logger.log(
        `Creating issue in ${analysis.repo} with labels: ${labels.join(', ')}`,
      );

      const response = await this.octokit.rest.issues.create({
        owner,
        repo,
        title: analysis.summary,
        body,
        labels,
        // NO assignees per spec section 13, rule 5
      });

      this.logger.log(
        `Issue created: ${response.data.html_url} (#${response.data.number})`,
      );

      return {
        issueNumber: response.data.number,
        issueUrl: response.data.url,
        htmlUrl: response.data.html_url,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create GitHub issue: ${error.message}`,
        error.stack,
      );

      if (error.status === 404) {
        throw new BadRequestException(
          `Repository not found: ${analysis.repo}. Check the repo name and token permissions.`,
        );
      }

      if (error.status === 422) {
        throw new BadRequestException(
          `GitHub validation error: ${error.message}`,
        );
      }

      throw new BadGatewayException(
        `Failed to create GitHub issue: ${error.message}`,
      );
    }
  }

  /**
   * Build labels based on analysis
   */
  private buildLabels(analysis: LlmAnalysis): string[] {
    const labels: string[] = ['ai-task'];

    // Add task type
    if (analysis.task_type) {
      labels.push(analysis.task_type);
    }

    // Add agent-specific labels
    if (analysis.recommended_agent === 'codex') {
      labels.push('codex');
    } else if (analysis.recommended_agent === 'copilot') {
      labels.push('copilot-eligible');
    }
    // claude-code is the default, no extra label needed

    return labels;
  }
}
