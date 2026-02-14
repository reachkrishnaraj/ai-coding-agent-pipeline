# AI Pipeline Metrics Tracking

> Reference document for setting up metrics tracking for the AI coding pipeline.

## Key Metrics

| Metric | Definition | Target (Week 1) | How to Track |
|--------|-----------|-----------------|-------------|
| **First-attempt success rate** | PRs merged without changes ÷ total PRs | >50% bug fixes, >30% features | GitHub PR merge events |
| **Time to PR** | Asana "AI Ready" → PR created | <30 min (simple), <60 min (complex) | Timestamp diff in n8n |
| **Cost per merged PR** | Total Anthropic API spend ÷ merged PRs | <$5/PR | Anthropic dashboard ÷ GitHub count |
| **Tasks attempted** | Issues labeled `ai-task` created per day | -- | n8n execution count |
| **PRs created** | PRs opened from `ai/` branches | -- | GitHub webhook count |
| **PRs rejected** | PRs closed without merge | <30% | GitHub PR close events |
| **Agent used** | Which agent handled the task | -- | GitHub issue labels |
| **Quality gate pass rate** | AI PRs that pass all quality gates on first run | >80% | `ai-validate-pr` workflow results |
| **Clarification rate** | Tasks where agent asked questions before coding | -- | GitHub issue comment count by bot |

## Simple Tracking: Google Sheet

Add a "Log to Google Sheet" node at each stage of your n8n workflows.

### Sheet Columns

| Column | Source | Example |
|--------|--------|---------|
| Timestamp | n8n execution time | 2026-02-11T14:30:00Z |
| Asana Task ID | From ticket | 1234567890 |
| Task Title | From ticket | "Fix: Payment status not updating" |
| Task Type | From labels | bug-fix |
| Agent | From routing | claude-code / copilot |
| Stage | From workflow node | task-created / pr-opened / pr-merged / pr-rejected |
| GitHub Issue # | From GitHub node | 42 |
| GitHub PR # | From GitHub webhook | 87 |
| Duration (minutes) | Calculated | 22 |
| Cost ($) | From API usage | 2.50 |

### Where to Add Logging Nodes

1. **After task intake** (Asana → GitHub Issue created) → Log: stage = "task-created"
2. **After PR created** (GitHub webhook) → Log: stage = "pr-opened", calculate duration
3. **After PR merged** (GitHub webhook) → Log: stage = "pr-merged"
4. **After PR rejected** (GitHub webhook) → Log: stage = "pr-rejected"
5. **After quality gate run** (GitHub Actions status) → Log: stage = "quality-gate-pass" or "quality-gate-fail"

## Dashboards

After 1 week of data, create a simple dashboard showing:

1. **Daily task volume** — bar chart of tasks attempted per day
2. **Success funnel** — Tasks → PRs Created → PRs Merged (conversion rates)
3. **Agent comparison** — Success rate by agent type (Claude vs Copilot)
4. **Task type performance** — Success rate by task type (bug vs feature vs refactor)
5. **Time to PR** — average and p90 by task type
6. **Cost trend** — daily spend with per-PR cost overlay

## Cost Monitoring

### Anthropic API

- Dashboard: https://console.anthropic.com/usage
- Track daily spend
- Set up billing alerts at $25/day and $50/day thresholds

### GitHub Actions

- Dashboard: Settings → Billing → Actions
- Track minutes used per workflow
- The `ai-coder` workflow is the biggest consumer

### Budget Guidelines

| Volume | Expected Monthly Cost |
|--------|----------------------|
| 5 tasks/day | $100-250 |
| 10 tasks/day | $200-500 |
| 20 tasks/day | $400-800 |
| 50+ tasks/day | Consider Temporal upgrade, negotiate API pricing |
