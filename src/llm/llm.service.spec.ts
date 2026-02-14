import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';
import { TaskInput } from '../common/interfaces/task.interface';

describe('LlmService', () => {
  describe('parseResponse logic', () => {
    const parseResponse = (content: string, task: TaskInput): LlmAnalysis => {
      try {
        // Strip markdown code fences if present
        let jsonContent = content.trim();

        // Remove ```json ... ``` or ``` ... ```
        const codeBlockMatch = jsonContent.match(
          /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/,
        );
        if (codeBlockMatch) {
          jsonContent = codeBlockMatch[1].trim();
        }

        const parsed = JSON.parse(jsonContent);

        // Validate required fields
        if (!parsed.task_type || !parsed.recommended_agent || !parsed.summary) {
          return getFallbackAnalysis(task);
        }

        return {
          clear_enough: parsed.clear_enough ?? true,
          questions: parsed.questions || [],
          task_type: parsed.task_type,
          recommended_agent: parsed.recommended_agent,
          summary: parsed.summary,
          suggested_acceptance_criteria:
            parsed.suggested_acceptance_criteria || [],
          likely_files: parsed.likely_files || [],
          repo: parsed.repo || task.repo,
        };
      } catch (error) {
        return getFallbackAnalysis(task);
      }
    };

    const getFallbackAnalysis = (task: TaskInput): LlmAnalysis => {
      return {
        clear_enough: false,
        questions: [
          'Could you provide more details about what needs to be changed?',
          'What is the expected behavior after this task is complete?',
          'Which files or modules should be modified?',
        ],
        task_type: (task.task_type_hint as any) || 'bug-fix',
        recommended_agent: 'claude-code',
        summary:
          task.description.slice(0, 100) +
          (task.description.length > 100 ? '...' : ''),
        suggested_acceptance_criteria: [],
        likely_files: task.files_hint
          ? task.files_hint.split(',').map((f) => f.trim())
          : [],
        repo: task.repo,
      };
    };

    it('should parse valid JSON response', () => {
      const validJson = `{
        "clear_enough": true,
        "task_type": "bug-fix",
        "recommended_agent": "claude-code",
        "summary": "Fix payment status bug",
        "suggested_acceptance_criteria": ["Payment updates correctly"],
        "likely_files": ["src/payment.ts"],
        "repo": "mothership/finance-service"
      }`;

      const task = {
        description: 'Fix payment bug',
        repo: 'mothership/finance-service',
      };

      const result = parseResponse(validJson, task);

      expect(result.clear_enough).toBe(true);
      expect(result.task_type).toBe('bug-fix');
      expect(result.recommended_agent).toBe('claude-code');
      expect(result.summary).toBe('Fix payment status bug');
    });

    it('should strip markdown code fences', () => {
      const jsonWithFences = `\`\`\`json
{
  "clear_enough": true,
  "task_type": "feature",
  "recommended_agent": "codex",
  "summary": "Add new feature",
  "repo": "mothership/finance-service"
}
\`\`\``;

      const task = {
        description: 'Add feature',
        repo: 'mothership/finance-service',
      };

      const result = parseResponse(jsonWithFences, task);

      expect(result.task_type).toBe('feature');
      expect(result.recommended_agent).toBe('codex');
    });

    it('should strip code fences without json specifier', () => {
      const jsonWithSimpleFences = `\`\`\`
{
  "clear_enough": false,
  "questions": ["What should happen?"],
  "task_type": "refactor",
  "recommended_agent": "claude-code",
  "summary": "Refactor module",
  "repo": "mothership/finance-service"
}
\`\`\``;

      const task = {
        description: 'Refactor',
        repo: 'mothership/finance-service',
      };

      const result = parseResponse(jsonWithSimpleFences, task);

      expect(result.task_type).toBe('refactor');
      expect(result.questions).toEqual(['What should happen?']);
    });

    it('should return fallback on invalid JSON', () => {
      const invalidJson = 'This is not JSON';

      const task = {
        description: 'Test task',
        repo: 'mothership/test-service',
        task_type_hint: 'bug-fix',
      };

      const result = parseResponse(invalidJson, task);

      expect(result.clear_enough).toBe(false);
      expect(result.task_type).toBe('bug-fix');
      expect(result.recommended_agent).toBe('claude-code');
      expect(result.questions).toHaveLength(3);
    });

    it('should return fallback on missing required fields', () => {
      const incompleteJson = `{
        "clear_enough": true
      }`;

      const task = {
        description: 'Test task',
        repo: 'mothership/test-service',
      };

      const result = parseResponse(incompleteJson, task);

      expect(result.clear_enough).toBe(false);
      expect(result.recommended_agent).toBe('claude-code');
    });
  });

  describe('buildUserMessage logic', () => {
    const buildUserMessage = (task: TaskInput): string => {
      const parts: string[] = [];

      parts.push(`Task Description: ${task.description}`);

      if (task.task_type_hint) {
        parts.push(`User's Type Hint: ${task.task_type_hint}`);
      }

      if (task.repo) {
        parts.push(`Target Repository: ${task.repo}`);
      }

      if (task.files_hint) {
        parts.push(`Files/Modules to Focus On: ${task.files_hint}`);
      }

      if (task.acceptance_criteria) {
        parts.push(`User's Acceptance Criteria: ${task.acceptance_criteria}`);
      }

      if (task.priority) {
        parts.push(`Priority: ${task.priority}`);
      }

      return parts.join('\n\n');
    };

    it('should build complete user message', () => {
      const task = {
        description: 'Fix payment bug',
        task_type_hint: 'bug-fix',
        repo: 'mothership/finance-service',
        files_hint: 'src/payment.ts',
        acceptance_criteria: 'Payment updates correctly',
        priority: 'urgent',
      };

      const message = buildUserMessage(task);

      expect(message).toContain('Task Description: Fix payment bug');
      expect(message).toContain("User's Type Hint: bug-fix");
      expect(message).toContain(
        'Target Repository: mothership/finance-service',
      );
      expect(message).toContain('Files/Modules to Focus On: src/payment.ts');
      expect(message).toContain(
        "User's Acceptance Criteria: Payment updates correctly",
      );
      expect(message).toContain('Priority: urgent');
    });

    it('should build minimal user message', () => {
      const task = {
        description: 'Simple task',
        repo: 'mothership/test',
      };

      const message = buildUserMessage(task);

      expect(message).toContain('Task Description: Simple task');
      expect(message).toContain('Target Repository: mothership/test');
      expect(message).not.toContain('Type Hint');
      expect(message).not.toContain('Files/Modules');
    });
  });

  describe('getFallbackAnalysis logic', () => {
    const getFallbackAnalysis = (task: TaskInput): LlmAnalysis => {
      return {
        clear_enough: false,
        questions: [
          'Could you provide more details about what needs to be changed?',
          'What is the expected behavior after this task is complete?',
          'Which files or modules should be modified?',
        ],
        task_type: (task.task_type_hint as any) || 'bug-fix',
        recommended_agent: 'claude-code',
        summary:
          task.description.slice(0, 100) +
          (task.description.length > 100 ? '...' : ''),
        suggested_acceptance_criteria: [],
        likely_files: task.files_hint
          ? task.files_hint.split(',').map((f) => f.trim())
          : [],
        repo: task.repo,
      };
    };

    it('should generate fallback with user hint', () => {
      const task = {
        description: 'Test task',
        repo: 'mothership/test',
        task_type_hint: 'feature',
      };

      const result = getFallbackAnalysis(task);

      expect(result.clear_enough).toBe(false);
      expect(result.task_type).toBe('feature');
      expect(result.recommended_agent).toBe('claude-code');
      expect(result.questions).toHaveLength(3);
    });

    it('should truncate long descriptions', () => {
      const longDescription = 'a'.repeat(150);
      const task = {
        description: longDescription,
        repo: 'mothership/test',
      };

      const result = getFallbackAnalysis(task);

      expect(result.summary.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.summary).toContain('...');
    });

    it('should parse files_hint', () => {
      const task = {
        description: 'Test',
        repo: 'mothership/test',
        files_hint: 'file1.ts, file2.ts, file3.ts',
      };

      const result = getFallbackAnalysis(task);

      expect(result.likely_files).toEqual(['file1.ts', 'file2.ts', 'file3.ts']);
    });
  });
});
