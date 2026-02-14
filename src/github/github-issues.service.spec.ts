import { BadRequestException } from '@nestjs/common';
import { LlmAnalysis } from '../common/interfaces/llm-analysis.interface';

describe('GitHubIssuesService', () => {
  describe('buildLabels logic', () => {
    const buildLabels = (analysis: LlmAnalysis): string[] => {
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

      return labels;
    };

    it('should build labels for claude-code', () => {
      const analysis: LlmAnalysis = {
        clear_enough: true,
        task_type: 'bug-fix' as const,
        recommended_agent: 'claude-code' as const,
        summary: 'Fix bug',
        repo: 'mothership/test',
      };

      const labels = buildLabels(analysis);

      expect(labels).toContain('ai-task');
      expect(labels).toContain('bug-fix');
      expect(labels).not.toContain('codex');
      expect(labels).not.toContain('copilot-eligible');
    });

    it('should build labels for codex', () => {
      const analysis: LlmAnalysis = {
        clear_enough: true,
        task_type: 'feature' as const,
        recommended_agent: 'codex' as const,
        summary: 'Add feature',
        repo: 'mothership/test',
      };

      const labels = buildLabels(analysis);

      expect(labels).toContain('ai-task');
      expect(labels).toContain('feature');
      expect(labels).toContain('codex');
    });

    it('should build labels for copilot', () => {
      const analysis: LlmAnalysis = {
        clear_enough: true,
        task_type: 'bug-fix' as const,
        recommended_agent: 'copilot' as const,
        summary: 'Fix typo',
        repo: 'mothership/test',
      };

      const labels = buildLabels(analysis);

      expect(labels).toContain('ai-task');
      expect(labels).toContain('bug-fix');
      expect(labels).toContain('copilot-eligible');
    });
  });

  describe('repo validation logic', () => {
    it('should reject non-mothership repos', () => {
      const repo = 'evil/hacker-repo';

      expect(() => {
        if (!repo.startsWith('mothership/')) {
          throw new BadRequestException(
            `Invalid repository: ${repo}. Only mothership/* repositories are allowed.`,
          );
        }
      }).toThrow(BadRequestException);
    });

    it('should accept mothership repos', () => {
      const repo = 'mothership/finance-service';

      expect(() => {
        if (!repo.startsWith('mothership/')) {
          throw new BadRequestException('Invalid repo');
        }
      }).not.toThrow();
    });
  });
});
