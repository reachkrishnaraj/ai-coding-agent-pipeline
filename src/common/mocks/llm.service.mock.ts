import { Injectable } from '@nestjs/common';
import { ILlmService } from '../interfaces/llm.service.interface';
import { LlmAnalysis } from '../interfaces/llm-analysis.interface';

@Injectable()
export class LlmServiceMock implements ILlmService {
  async analyzeTask(task: {
    description: string;
    task_type_hint?: string;
    repo?: string;
    files_hint?: string[];
    acceptance_criteria?: string;
  }): Promise<LlmAnalysis> {
    // Mock implementation for testing
    const needsClarification = task.description.length < 20;

    return {
      clear_enough: !needsClarification,
      questions: needsClarification
        ? [
            'Can you provide more details about the expected behavior?',
            'What is the current behavior that needs to be changed?',
          ]
        : undefined,
      task_type:
        (task.task_type_hint as
          | 'bug-fix'
          | 'feature'
          | 'refactor'
          | 'test-coverage') || 'bug-fix',
      recommended_agent: 'claude-code',
      summary: `Fix: ${task.description.substring(0, 50)}`,
      suggested_acceptance_criteria: [
        'All existing tests pass',
        'New functionality is tested',
      ],
      likely_files: task.files_hint?.length
        ? task.files_hint
        : ['src/modules/example/'],
      repo: task.repo || 'mothership/finance-service',
    };
  }
}
