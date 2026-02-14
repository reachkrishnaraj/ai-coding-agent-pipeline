# n8n Workflows — AI Coding Pipeline

> n8n is the **brain** of the AI factory. It handles conversation, routing, and notifications.
> GitHub Actions is the **muscle** — it runs the actual coding agents.

## Architecture

```
YOU (Slack / Asana)
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  n8n CLOUD (The Brain)                                       │
│                                                              │
│  Workflow 1: INTAKE + CONVERSATION                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Receive task (Slack DM / Asana / Webhook)            │   │
│  │   → Claude API: analyze task, generate questions     │   │
│  │   → Slack DM: ask you questions                      │   │
│  │   → You reply in Slack                               │   │
│  │   → Claude API: confirm understanding                │   │
│  │   → Route: Claude / Codex / Copilot                  │   │
│  │   → Create GitHub Issue (with full context)          │   │
│  │   → Update Asana: "In Progress (AI)"                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Workflow 2: FEEDBACK LOOP                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GitHub PR webhook                                     │   │
│  │   → PR opened: Slack DM "PR ready" + Asana update    │   │
│  │   → PR merged: Slack DM "Done" + Asana complete      │   │
│  │   → PR rejected: Slack DM "Needs attention" + Asana  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Workflow 3: MID-WORK QUESTIONS                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ GitHub Issue comment webhook (by bot)                 │   │
│  │   → Relay agent's question to your Slack DM           │   │
│  │   → You reply in Slack                                │   │
│  │   → n8n posts your answer as GitHub issue comment     │   │
│  │   → GitHub Action re-triggers                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  GITHUB ACTIONS (The Muscle)                                 │
│                                                              │
│  ai-coder.yml        → Claude Code (features, refactors)    │
│  ai-coder-codex.yml  → Codex CLI (quick code gen)           │
│  copilot-assign.yml  → Copilot Agent (simple bugs)          │
│  ai-validate-pr.yml  → Quality gates (all AI PRs)           │
└─────────────────────────────────────────────────────────────┘
```

## Workflows in This Directory

### Workflow 1: Intake + Conversation (3 files — n8n limitation)

n8n cannot have a Form Trigger + Respond to Webhook in the same workflow ([GitHub #21289](https://github.com/n8n-io/n8n/issues/21289)). So Workflow 1 is split into 3 importable JSONs:

| File | Purpose | Import Order |
|------|---------|:---:|
| `workflow-1a-core-logic.json` | **Sub-workflow**: Normalize → Claude Analyze → Build Issue → Create GitHub Issue | **1st** |
| `workflow-1b-form-trigger.json` | Form Trigger → calls Core Logic → Form Ending (browser) | **2nd** |
| `workflow-1c-webhook-trigger.json` | Webhook Trigger → calls Core Logic → Respond to Webhook (curl/API) | **3rd** |
| `workflow-1-intake-conversation.json` | ~~Deprecated~~ — pointer to the 3 files above | — |
| `workflow-1-intake-conversation.md` | Design doc (node-by-node build guide) | Reference |

**Setup:** Import 1a first and activate. Then import 1b and 1c — in each, open the "Run Core Logic" node and select the Core Logic sub-workflow from the dropdown, then activate.

### Other Workflows

| File | Purpose | Build Priority |
|------|---------|:---:|
| `workflow-2-feedback-loop.md` | GitHub PR → Asana/Slack sync | 2nd |
| `workflow-3-midwork-relay.md` | Relay agent questions to Slack during coding | 3rd |
| `metrics-tracking.md` | Dashboard and cost monitoring setup | Later |

## n8n Credentials Required

| Credential | n8n Node Type | How to Get |
|------------|--------------|-----------|
| **Anthropic API** | HTTP Request (or AI Agent node) | console.anthropic.com → API Keys |
| **GitHub Personal Access Token** | GitHub node | github.com → Settings → Developer settings → PAT (fine-grained, repo scope) |
| **Slack Bot Token** | Slack node | api.slack.com → Create app → OAuth → Bot Token |
| **Asana Personal Access Token** | Asana node | app.asana.com → Settings → Apps → Developer Apps → PAT |

## n8n Environment Variables (Optional)

Set these in n8n Cloud Settings → Variables for reuse across workflows:

| Variable | Value |
|----------|-------|
| `GITHUB_REPO` | `mothership/finance-service` |
| `SLACK_USER_ID` | `[Your Slack user ID for DMs]` |
| `ASANA_PROJECT_ID` | `[Your Asana project GID]` |
