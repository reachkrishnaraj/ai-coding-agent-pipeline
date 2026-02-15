import { generateIssueBody } from './issue-body.template';

describe('Issue Body Template', () => {
  it('should generate complete issue body', () => {
    const data = {
      taskId: 'task-123',
      source: 'web',
      description: 'Fix the payment status bug',
      analysis: {
        clear_enough: true,
        task_type: 'bug-fix' as const,
        recommended_agent: 'claude-code' as const,
        summary: 'Fix Stripe webhook handler to update payment status',
        suggested_acceptance_criteria: [
          'Payment status updates to Succeeded',
          'succeededAt timestamp is set',
        ],
        likely_files: [
          'src/modules/customer-payment/payment.service.ts',
          'src/webhooks/stripe.controller.ts',
        ],
        repo: 'mothership/finance-service',
      },
    };

    const body = generateIssueBody(data);

    expect(body).toContain('## Task');
    expect(body).toContain(
      'Fix Stripe webhook handler to update payment status',
    );
    expect(body).toContain('## Description');
    expect(body).toContain('Fix the payment status bug');
    expect(body).toContain('## Acceptance Criteria');
    expect(body).toContain('- [ ] Payment status updates to Succeeded');
    expect(body).toContain('- [ ] succeededAt timestamp is set');
    expect(body).toContain('## Likely Files');
    expect(body).toContain('`src/modules/customer-payment/payment.service.ts`');
    expect(body).toContain('## Agent Instructions');
    expect(body).toContain('- Task type: **bug-fix**');
    expect(body).toContain('`.ai/prompts/bug-fix.md`');
    expect(body).toContain('## Scope');
    expect(body).toContain('Only modify files related to this task');
    expect(body).toContain('Created by AI Pipeline | Task ID: task-123');
    expect(body).toContain('Source: web');
  });

  it('should include clarification Q&A when present', () => {
    const data = {
      taskId: 'task-456',
      source: 'slack',
      description: 'Update invoice calculation',
      analysis: {
        clear_enough: true,
        task_type: 'feature' as const,
        recommended_agent: 'claude-code' as const,
        summary: 'Add tax calculation to invoices',
        repo: 'mothership/finance-service',
      },
      clarificationQA: [
        {
          question: 'What tax rate should be used?',
          answer: '10% for all invoices',
        },
        {
          question: 'Should existing invoices be updated?',
          answer: 'No, only new invoices',
        },
      ],
    };

    const body = generateIssueBody(data);

    expect(body).toContain('## Clarification Q&A');
    expect(body).toContain('**Q:** What tax rate should be used?');
    expect(body).toContain('> 10% for all invoices');
    expect(body).toContain('**Q:** Should existing invoices be updated?');
    expect(body).toContain('> No, only new invoices');
    expect(body).toContain('This task has been pre-clarified');
    expect(body).toContain('Do NOT ask clarifying questions');
  });

  it('should handle minimal data', () => {
    const data = {
      taskId: 'task-789',
      source: 'api',
      description: 'Simple task',
      analysis: {
        clear_enough: true,
        task_type: 'refactor' as const,
        recommended_agent: 'codex' as const,
        summary: 'Refactor module',
        repo: 'mothership/test-service',
      },
    };

    const body = generateIssueBody(data);

    expect(body).toContain('## Task');
    expect(body).toContain('Refactor module');
    expect(body).toContain('## Description');
    expect(body).toContain('Simple task');
    expect(body).toContain('## Agent Instructions');
    expect(body).not.toContain('## Acceptance Criteria');
    expect(body).not.toContain('## Likely Files');
    expect(body).not.toContain('## Clarification Q&A');
  });
});
