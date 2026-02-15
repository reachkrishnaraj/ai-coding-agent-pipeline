# Workflow 1: Intake + Conversation (The Front Door)

> This is the most important workflow. It receives tasks, has a conversation
> with you to clarify requirements, then dispatches to the right coding agent.

## Flow Overview

```
TRIGGER (any of these):
  ├── Slack DM: "I need to fix the payment status bug..."
  ├── Asana: Task moved to "AI Ready"
  └── Webhook: POST with task JSON
        │
        ▼
PARSE & ANALYZE
  │  n8n Code node: extract task details
  │  Claude API: analyze task, identify gaps
  │
  ▼
CONVERSATION (Slack)
  │  Claude → Slack DM: "I have 2 questions before starting..."
  │  You reply in Slack
  │  Claude → Slack DM: "Got it. Here's my plan: [summary]. Proceed?"
  │  You: "Yes" / "No, change X"
  │  (loop until confirmed)
  │
  ▼
ROUTE & DISPATCH
  │  Classify: bug-fix / feature / refactor / test-coverage
  │  Pick agent: Claude Code / Codex / Copilot
  │  Create GitHub Issue (with FULL conversation context)
  │
  ▼
NOTIFY
     Update Asana → "In Progress (AI)"
     Slack DM → "Agent is working on it"
```

## Detailed Node-by-Node Build Guide

---

### TRIGGER SECTION

#### Node 1a: Slack Trigger (Primary Input)

**n8n Node Type:** Slack Trigger

**Configuration:**
- Event: Message received (DM to your bot)
- Or: Message in a specific channel (e.g., `#ai-tasks`)

**When to use:** When you want to just type a task description in Slack.

**Output:** `{ text: "Fix the payment status bug when Stripe webhook fires", user: "U12345" }`

---

#### Node 1b: Asana Trigger (Alternative Input)

**n8n Node Type:** Asana Trigger

**Configuration:**
- Resource: Task
- Event: Task moved to section
- Project: `{{ $vars.ASANA_PROJECT_ID }}`
- Section: "AI Ready"

**When to use:** When you have structured Asana tasks.

**Output:** `{ gid: "1234567890", name: "Fix: Payment status bug", ... }`

---

#### Node 1c: Webhook Trigger (Programmatic Input)

**n8n Node Type:** Webhook

**Configuration:**
- HTTP Method: POST
- Path: `/ai-task`

**When to use:** When you want to submit tasks programmatically (curl, script, flat file processor).

**Example call:**
```bash
curl -X POST https://your-n8n.cloud/webhook/ai-task \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix: Payment status not updating",
    "description": "When Stripe webhook fires...",
    "type": "bug-fix",
    "files": ["src/modules/customer-payment/"]
  }'
```

---

### NORMALIZE SECTION

#### Node 2: Code — Normalize Input

**n8n Node Type:** Code

Converts all three trigger formats into a single unified format.

```javascript
const input = $input.first().json;
let task = {};

// Determine which trigger fired
if (input.text && input.user) {
  // Slack trigger
  task = {
    source: 'slack',
    title: input.text.substring(0, 100),
    description: input.text,
    slackUserId: input.user,
    slackThreadTs: input.ts,
    asanaGid: null,
  };
} else if (input.gid) {
  // Asana trigger
  task = {
    source: 'asana',
    title: input.name,
    description: input.notes || input.html_notes || '',
    asanaGid: input.gid,
    slackUserId: $vars.SLACK_USER_ID,
    acceptanceCriteria: input.custom_fields
      ?.find(f => f.name === 'Acceptance Criteria')?.text_value || '',
    moduleArea: input.custom_fields
      ?.find(f => f.name === 'Module' || f.name === 'Area')?.text_value || '',
  };
} else {
  // Webhook trigger
  task = {
    source: 'webhook',
    title: input.title || 'Untitled task',
    description: input.description || '',
    type: input.type || null,
    files: input.files || [],
    slackUserId: $vars.SLACK_USER_ID,
    asanaGid: null,
  };
}

return task;
```

---

### CONVERSATION SECTION (The Key Differentiator)

#### Node 3: HTTP Request — Claude API (Analyze Task)

**n8n Node Type:** HTTP Request

**Configuration:**
- Method: POST
- URL: `https://api.anthropic.com/v1/messages`
- Headers:
  - `x-api-key`: `{{ $credentials.anthropicApi.apiKey }}`
  - `anthropic-version`: `2023-06-01`
  - `content-type`: `application/json`
- Body (JSON):

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "system": "You are a senior engineering lead reviewing tasks before they go to an AI coding agent. The agent works on the Mothership Finance Service — a NestJS/TypeScript microservice with CQRS architecture, Prisma ORM, Vitest testing, and Biome linting. It handles customer payments, invoices, refunds, vendor bills, Stripe integration, and NetSuite sync.\n\nYour job:\n1. Analyze the task for clarity and completeness\n2. Identify any ambiguities, missing acceptance criteria, or unclear scope\n3. Generate clarifying questions if needed\n4. Classify the task type: bug-fix, feature, refactor, or test-coverage\n5. Recommend which agent should handle it: claude-code (complex), codex (quick generation), or copilot (simple bugs)\n\nRespond in this JSON format:\n{\n  \"clear_enough\": true/false,\n  \"questions\": [\"question 1\", \"question 2\"],\n  \"task_type\": \"bug-fix|feature|refactor|test-coverage\",\n  \"recommended_agent\": \"claude-code|codex|copilot\",\n  \"summary\": \"One-sentence summary of what needs to be done\",\n  \"suggested_acceptance_criteria\": [\"criterion 1\", \"criterion 2\"],\n  \"likely_files\": [\"src/modules/...\", \"src/libs/...\"]\n}",
  "messages": [
    {
      "role": "user",
      "content": "Task title: {{ $json.title }}\n\nTask description:\n{{ $json.description }}\n\n{{ $json.acceptanceCriteria ? 'Acceptance criteria: ' + $json.acceptanceCriteria : '' }}\n{{ $json.moduleArea ? 'Module/Area: ' + $json.moduleArea : '' }}\n{{ $json.files ? 'Files mentioned: ' + $json.files.join(', ') : '' }}"
    }
  ]
}
```

**Output:** Parsed JSON with `clear_enough`, `questions`, `task_type`, `recommended_agent`, etc.

---

#### Node 4: IF — Has Questions?

**n8n Node Type:** IF

**Condition:** `{{ $json.clear_enough === false && $json.questions.length > 0 }}`

- **True (has questions)** → Node 5 (Ask questions via Slack)
- **False (task is clear)** → Node 7 (Skip to dispatch)

---

#### Node 5: Slack — Ask Clarifying Questions

**n8n Node Type:** Slack (Send Message)

**Configuration:**
- Channel: DM to `{{ $json.slackUserId }}`
- Message:
```
🤖 *New AI task received:* {{ $json.title }}

I have a few questions before sending this to the coding agent:

{{ $json.questions.map((q, i) => `${i+1}. ${q}`).join('\n') }}

Please reply in this thread with your answers.
```
- **Important:** Note the `ts` (thread timestamp) of this message — needed for the reply listener.

---

#### Node 6: Slack Trigger — Wait for Reply

**n8n Node Type:** Slack Trigger (or use n8n's "Wait" node + Slack webhook)

**Two approaches:**

**Approach A: Wait node (simpler)**
- Use n8n's **Wait** node set to "Wait for webhook"
- This pauses the workflow until you reply
- When you reply in the Slack thread, a separate small workflow catches it and resumes this one

**Approach B: Separate reply workflow (more robust)**
- Create a mini-workflow:
  1. Slack Trigger → message in thread
  2. Check if thread matches a pending AI task
  3. Resume the main workflow via webhook

**Your reply** gets fed back to Claude API for confirmation:

#### Node 6b: HTTP Request — Claude API (Confirm Understanding)

**Configuration:** Same as Node 3, but with the conversation history:

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "messages": [
    { "role": "user", "content": "[original task]" },
    { "role": "assistant", "content": "[questions asked]" },
    { "role": "user", "content": "[your answers from Slack]" }
  ]
}
```

**Expected output:**
```json
{
  "understood": true,
  "final_summary": "Fix customer payment status to update to Succeeded when Stripe payment_intent.succeeded webhook fires. Affects both card and ACH. Must also trigger NetSuite sync.",
  "acceptance_criteria": ["Payment status updates to Succeeded", "succeededAt is set", "NetSuite sync queued"],
  "task_type": "bug-fix",
  "recommended_agent": "claude-code",
  "likely_files": ["src/apps/events-worker/controllers/webhooks/stripe-webhook.controller.ts", "src/modules/customer-payment/commands/update-customer-payment/"]
}
```

If `understood: false`, loop back to Node 5 (ask more questions). Max 3 loops.

---

### DISPATCH SECTION

#### Node 7: Code — Build GitHub Issue Body

**n8n Node Type:** Code

```javascript
const task = $input.first().json;

// Build a rich, pre-clarified issue body
const issueBody = `
## Task
${task.final_summary || task.title}

## Description
${task.description}

## Acceptance Criteria
${(task.acceptance_criteria || task.suggested_acceptance_criteria || [])
  .map(c => `- [ ] ${c}`).join('\n')}

## Likely Files
${(task.likely_files || []).map(f => `- \`${f}\``).join('\n')}

## Agent Instructions
- Task type: **${task.task_type}**
- Read prompt template: \`.ai/prompts/${task.task_type}.md\`
- This task has been pre-clarified. All questions have been answered.
- Proceed directly to implementation. Do NOT ask clarifying questions.

## Scope
- Only modify files related to this task
- All existing tests must continue to pass
- Add tests for any new functionality
- Follow conventions in CLAUDE.md

${task.asanaGid ? `## Asana\nID: ${task.asanaGid}\nURL: https://app.asana.com/0/0/${task.asanaGid}` : ''}

---
*This issue was created by the AI Pipeline via n8n. Task source: ${task.source}*
`;

// Determine labels
const labels = ['ai-task', task.task_type];
if (task.recommended_agent === 'copilot') {
  labels.push('copilot-eligible');
}
if (task.recommended_agent === 'codex') {
  labels.push('codex');
}

return {
  title: task.final_summary || task.title,
  body: issueBody,
  labels: labels,
  agent: task.recommended_agent,
  asanaGid: task.asanaGid,
  source: task.source,
};
```

---

#### Node 8: Switch — Route to Agent

**n8n Node Type:** Switch

| Condition | Route |
|-----------|-------|
| `agent === 'copilot'` | Node 9a: Create issue + assign @copilot |
| `agent === 'codex'` | Node 9b: Create issue with `codex` label |
| `agent === 'claude-code'` (default) | Node 9c: Create issue with `ai-task` label |

---

#### Node 9a/9b/9c: GitHub — Create Issue

**n8n Node Type:** GitHub

**Configuration:**
- Action: Create Issue
- Owner: `mothership`
- Repository: `finance-service`
- Title: `{{ $json.title }}`
- Body: `{{ $json.body }}`
- Labels: `{{ $json.labels }}`
- Assignees: `{{ $json.agent === 'copilot' ? ['copilot'] : [] }}`

---

#### Node 10: Asana — Update Task (if from Asana)

**n8n Node Type:** IF + Asana

**Condition:** `{{ $json.asanaGid !== null }}`

If true:
- Move task to "In Progress (AI)" section
- Add comment: "🤖 AI agent started.\n\nAgent: {{ $json.agent }}\nGitHub Issue: {{ issueUrl }}\nStarted: {{ new Date().toISOString() }}"

---

#### Node 11: Slack — Confirm Dispatch

**n8n Node Type:** Slack (Send Message)

- DM to you:
```
✅ *Task dispatched to {{ agent }}*

*Task:* {{ title }}
*Agent:* {{ agent }}
*GitHub:* {{ issueUrl }}
{{ asanaGid ? '*Asana:* https://app.asana.com/0/0/' + asanaGid : '' }}

I'll DM you when the PR is ready.
```

---

## Testing This Workflow

1. Send a Slack DM to your bot: "Fix the payment status bug when Stripe webhook fires for ACH payments"
2. Bot should reply with clarifying questions
3. Answer the questions in the Slack thread
4. Bot should confirm understanding and dispatch to GitHub
5. Check: GitHub issue created with full context and correct labels
6. Check: Asana task moved (if applicable)
7. Check: GitHub Action triggers and agent starts coding
