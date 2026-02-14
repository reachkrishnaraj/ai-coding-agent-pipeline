import { ConfigService } from '@nestjs/config';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { TaskInput } from '../common/interfaces/task.interface';
export declare class LlmService {
    private readonly configService;
    private readonly logger;
    private readonly openai;
    private readonly octokit;
    private readonly promptCache;
    private readonly CACHE_TTL;
    constructor(configService: ConfigService);
    analyzeTask(task: TaskInput): Promise<LlmAnalysis>;
    private getSystemPrompt;
    private buildUserMessage;
    private parseResponse;
    private getFallbackAnalysis;
}
