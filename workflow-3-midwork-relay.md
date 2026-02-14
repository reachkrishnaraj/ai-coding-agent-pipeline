# Workflow 3: Mid-Work Question Relay (Agent ↔ Slack)

> When the coding agent gets stuck during implementation and posts a question
> on the GitHub issue, this workflow relays it to your Slack DM and sends
> your reply back so the agent can continue.

## Flow

```
Agent posts question on GitHub Issue (comment by bot)
  → n8n catches GitHub webhook
  → Relay question to your Slack DM
  → You reply in Slack thread
  → n8n posts your answer as GitHub Issue comment
  → GitHub Action re-triggers (issue_comment event)
  → Agent reads your answer and continues coding
```

## Nodes

### Node 1: GitHub Trigger — Issue Comment

**n8n Node Type:** GitHub Trigger

**Configuration:**
- Event: Issue Comment (created)
- Repository: `mothership/finance-service`
- Filter: Only comments by `github-actions[bot]` on issues labeled `ai-task`

```javascript
// Filter logic
const comment = $input.first().json;
const isBot = comment.comment.user.login === 'github-actions[bot]';
const isAiTask = comment.issue.labels.some(l => l.name === 'ai-task');
const isQuestion = comment.comment.body.includes('?'); // Simple heuristic

if (!isBot || !isAiTask) {
  return []; // Skip non-bot comments on non-AI issues
}

return {
  issueNumber: comment.issue.number,
  issueTitle: comment.issue.title,
  question: comment.comment.body,
  issueUrl: comment.issue.html_url,
  commentId: comment.comment.id,
};
```

### Node 2: Slack — Send Question to DM

**n8n Node Type:** Slack (Send Message)

**Configuration:**
- Channel: DM to `{{ $vars.SLACK_USER_ID }}`
- Message:
```
🤖 *Agent needs your input*

Working on: *{{ issueTitle }}*

{{ question }}

Reply in this thread and I'll relay your answer to the agent.

<{{ issueUrl }}|View on GitHub>
```

### Node 3: Wait for Slack Reply

**n8n Node Type:** Wait (webhook resume) or separate Slack trigger workflow

When you reply in the Slack thread:

### Node 4: GitHub — Post Reply as Issue Comment

**n8n Node Type:** GitHub (Create Comment)

**Configuration:**
- Owner: `mothership`
- Repository: `finance-service`
- Issue Number: `{{ $json.issueNumber }}`
- Body: `{{ $json.slackReply }}`

This triggers the `issue_comment` event in `ai-coder.yml`, which re-runs the Claude Code Action. The agent picks up where it left off with your answer as context.

### Node 5: Slack — Confirm Relay

**n8n Node Type:** Slack (Send Message)

- Reply in the same thread:
```
✅ Answer relayed to the agent. It's continuing work now.
```

---

## Why This Matters

Without this workflow, the conversation goes:
1. Agent posts question on GitHub
2. You have to go to GitHub to see it
3. You reply on GitHub
4. Action re-triggers (1-2 min delay)

With this workflow:
1. Agent posts question on GitHub
2. You get a Slack DM instantly
3. You reply in Slack (where you already are)
4. n8n posts it to GitHub for you
5. Action re-triggers

You never leave Slack.
