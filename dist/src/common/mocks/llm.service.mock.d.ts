import { ILlmService } from '../interfaces/llm.service.interface';
import { LlmAnalysis } from '../interfaces/llm-analysis.interface';
export declare class LlmServiceMock implements ILlmService {
    analyzeTask(task: {
        description: string;
        task_type_hint?: string;
        repo?: string;
        files_hint?: string;
        acceptance_criteria?: string;
    }): Promise<LlmAnalysis>;
}
