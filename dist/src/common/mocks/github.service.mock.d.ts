import { IGitHubService } from '../interfaces/github.service.interface';
import { LlmAnalysis } from '../interfaces/llm-analysis.interface';
export declare class GitHubServiceMock implements IGitHubService {
    createIssue(task: {
        id: string;
        description: string;
        repo: string;
    }, analysis: LlmAnalysis): Promise<{
        issueNumber: number;
        issueUrl: string;
        htmlUrl: string;
    }>;
}
