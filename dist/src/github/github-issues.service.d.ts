import { ConfigService } from '@nestjs/config';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { ClarificationQA } from '../common/interfaces/task.interface';
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
export declare class GitHubIssuesService {
    private readonly configService;
    private readonly logger;
    private readonly octokit;
    constructor(configService: ConfigService);
    createIssue(input: CreateIssueInput): Promise<CreateIssueResult>;
    private buildLabels;
}
