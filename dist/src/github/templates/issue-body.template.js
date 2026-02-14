"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIssueBody = generateIssueBody;
function generateIssueBody(data) {
    const { taskId, source, description, analysis, clarificationQA } = data;
    const sections = [];
    sections.push(`## Task`);
    sections.push(analysis.summary);
    sections.push('');
    sections.push(`## Description`);
    sections.push(description);
    sections.push('');
    if (analysis.suggested_acceptance_criteria &&
        analysis.suggested_acceptance_criteria.length > 0) {
        sections.push(`## Acceptance Criteria`);
        analysis.suggested_acceptance_criteria.forEach((criterion) => {
            sections.push(`- [ ] ${criterion}`);
        });
        sections.push('');
    }
    if (analysis.likely_files && analysis.likely_files.length > 0) {
        sections.push(`## Likely Files`);
        analysis.likely_files.forEach((file) => {
            sections.push(`- \`${file}\``);
        });
        sections.push('');
    }
    sections.push(`## Agent Instructions`);
    sections.push(`- Task type: **${analysis.task_type}**`);
    sections.push(`- Read prompt template: \`.ai/prompts/${analysis.task_type}.md\``);
    if (clarificationQA && clarificationQA.length > 0) {
        sections.push(`- This task has been pre-clarified. All questions have been answered.`);
        sections.push(`- Proceed directly to implementation. Do NOT ask clarifying questions.`);
    }
    sections.push('');
    sections.push(`## Scope`);
    sections.push(`- Only modify files related to this task`);
    sections.push(`- All existing tests must continue to pass`);
    sections.push(`- Add tests for any new functionality`);
    sections.push(`- Follow conventions in CLAUDE.md`);
    sections.push('');
    if (clarificationQA && clarificationQA.length > 0) {
        sections.push(`## Clarification Q&A`);
        clarificationQA.forEach((qa) => {
            sections.push(`**Q:** ${qa.question}`);
            sections.push(`> ${qa.answer}`);
            sections.push('');
        });
    }
    sections.push(`---`);
    sections.push(`*Created by AI Pipeline | Task ID: ${taskId} | Source: ${source}*`);
    return sections.join('\n');
}
//# sourceMappingURL=issue-body.template.js.map