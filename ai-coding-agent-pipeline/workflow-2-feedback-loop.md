# n8n Workflow: GitHub PR → Asana Update (Feedback Loop)

> Reference document for building the reverse sync n8n workflow.
> Updates Asana task status when PR events occur on GitHub.

## Flow

```
GitHub PR Event (opened/merged/closed)
  → Extract Asana Task GID from PR body
  → Switch on event type
  → Update Asana task (status, comment)
  → Notify via Slack
```

## Nodes

### Node 1: GitHub Trigger (Webhook)

**n8n Node Type:** GitHub Trigger

**Configuration:**
- Events: Pull Request (opened, closed)
- Repository: `mothership/finance-service`  <!-- TODO: Customize for your service -->

**Filter:** Only process PRs from branches starting with `ai/` or created by `github-actions[bot]`

### Node 2: Code — Extract Asana GID

**n8n Node Type:** Code

```javascript
const pr = $input.first().json.pull_request;
const body = pr.body || '';

// Parse Asana task ID from PR body
const match = body.match(/ID:\s*(\d+)/);
const asanaGid = match ? match[1] : null;

if (!asanaGid) {
  // No Asana task linked — skip
  return { skip: true };
}

return {
  skip: false,
  asanaGid: asanaGid,
  prUrl: pr.html_url,
  prTitle: pr.title,
  prNumber: pr.number,
  action: $input.first().json.action,
  merged: pr.merged || false,
};
```

### Node 3: Switch — PR Event Type

**n8n Node Type:** Switch

| Condition | Action |
|-----------|--------|
| `action === 'opened'` | PR Created → Node 4a |
| `action === 'closed' && merged === true` | PR Merged → Node 4b |
| `action === 'closed' && merged === false` | PR Rejected → Node 4c |

### Node 4a: PR Opened — Update Asana

**Asana Actions:**
1. Move task to **"AI PR Ready"** section
2. Add comment: "🤖 PR created and ready for review.\n\nPR: {{ prUrl }}\nTitle: {{ prTitle }}"

**Slack:** DM to Krishna: "🤖 AI PR ready for review: *{{ prTitle }}*\n{{ prUrl }}"

### Node 4b: PR Merged — Update Asana

**Asana Actions:**
1. Mark task as **Complete**
2. Add comment: "✅ PR merged and deployed.\n\nPR: {{ prUrl }}"

**Slack:** DM to Krishna: "✅ AI task completed: *{{ prTitle }}*"

### Node 4c: PR Rejected — Update Asana

**Asana Actions:**
1. Move task to **"AI Retry"** section (or "Manual" if it's been retried already)
2. Add comment: "❌ PR was closed without merge.\n\nPR: {{ prUrl }}\n\nThis task needs manual attention or a revised description."

**Slack:** DM to Krishna: "⚠️ AI PR rejected: *{{ prTitle }}* — needs manual attention"

---

## Retry Logic

If a task lands in "AI Retry":
1. Human reviews the PR feedback and rejection reason
2. Human updates the Asana task with better context
3. Human moves the task back to "AI Ready"
4. Pipeline re-triggers automatically

**Safeguard:** Add a counter custom field "AI Attempts" on the Asana task. If attempts > 2, move to "Manual" instead of "AI Retry" to prevent infinite loops.
