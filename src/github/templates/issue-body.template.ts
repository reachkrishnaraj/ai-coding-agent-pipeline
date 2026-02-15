import { LlmAnalysis } from '../../common/interfaces/llm-analysis.interface';
import { ClarificationQA } from '../../common/interfaces/task.interface';

export interface IssueTemplateData {
  taskId: string;
  source: string;
  description: string;
  analysis: LlmAnalysis;
  clarificationQA?: ClarificationQA[];
  pipelineUrl?: string;
}

export function generateIssueBody(data: IssueTemplateData): string {
  const { taskId, source, description, analysis, clarificationQA, pipelineUrl } = data;

  const sections: string[] = [];

  // Task summary
  sections.push(`## Task`);
  sections.push(analysis.summary);
  sections.push('');

  // Description
  sections.push(`## Description`);
  sections.push(description);
  sections.push('');

  // Acceptance Criteria
  if (
    analysis.suggested_acceptance_criteria &&
    analysis.suggested_acceptance_criteria.length > 0
  ) {
    sections.push(`## Acceptance Criteria`);
    analysis.suggested_acceptance_criteria.forEach((criterion) => {
      sections.push(`- [ ] ${criterion}`);
    });
    sections.push('');
  }

  // Likely Files
  if (analysis.likely_files && analysis.likely_files.length > 0) {
    sections.push(`## Likely Files`);
    analysis.likely_files.forEach((file) => {
      sections.push(`- \`${file}\``);
    });
    sections.push('');
  }

  // Agent Instructions
  sections.push(`## Agent Instructions`);
  sections.push(`- Task type: **${analysis.task_type}**`);
  sections.push(
    `- Read prompt template: \`.ai/prompts/${analysis.task_type}.md\``,
  );
  if (clarificationQA && clarificationQA.length > 0) {
    sections.push(
      `- This task has been pre-clarified. All questions have been answered.`,
    );
    sections.push(
      `- Proceed directly to implementation. Do NOT ask clarifying questions.`,
    );
  }
  sections.push('');

  // Scope
  sections.push(`## Scope`);
  sections.push(`- Only modify files related to this task`);
  sections.push(`- All existing tests must continue to pass`);
  sections.push(`- Add tests for any new functionality`);
  sections.push(`- Follow conventions in CLAUDE.md`);
  sections.push('');

  // Clarification Q&A (if present)
  if (clarificationQA && clarificationQA.length > 0) {
    sections.push(`## Clarification Q&A`);
    clarificationQA.forEach((qa) => {
      sections.push(`**Q:** ${qa.question}`);
      sections.push(`> ${qa.answer}`);
      sections.push('');
    });
  }

  // Footer
  sections.push(`---`);
  if (pipelineUrl) {
    sections.push(
      `**Pipeline Task:** [View in AI Pipeline](${pipelineUrl}/tasks/${taskId})`,
    );
    sections.push('');
  }
  sections.push(
    `*Created by AI Pipeline | Task ID: ${taskId} | Source: ${source}*`,
  );

  return sections.join('\n');
}
