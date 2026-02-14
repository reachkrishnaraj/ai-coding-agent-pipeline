import { LlmAnalysis } from '../../common/interfaces/llm-analysis.interface';
import { ClarificationQA } from '../../common/interfaces/task.interface';
export interface IssueTemplateData {
    taskId: string;
    source: string;
    description: string;
    analysis: LlmAnalysis;
    clarificationQA?: ClarificationQA[];
}
export declare function generateIssueBody(data: IssueTemplateData): string;
