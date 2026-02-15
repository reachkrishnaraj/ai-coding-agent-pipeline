# 🏗️ Mothership AI Coding Pipeline — 5-Day Implementation Plan

**Goal:** Asana ticket in → AI-coded, AI-reviewed, human-approved PR out  
**Stack:** Node.js/TypeScript · GitHub + Argo CD · n8n Cloud · Cursor Bot (review)  
**Agents:** Claude Code CLI · OpenAI Codex CLI · GitHub Copilot Coding Agent · Cursor  
**Autonomy:** Semi-autonomous — human approves merge

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────────┐
│   ASANA      │────▶│   n8n Cloud  │────▶│  CODING AGENT    │────▶│  GITHUB PR     │────▶│  HUMAN       │
│   Ticket     │     │  (Orchestr.) │     │  (Sandboxed)     │     │  + Cursor Bot  │     │  Review +    │
│              │     │              │     │                  │     │  Auto-Review   │     │  Merge       │
└─────────────┘     └──────────────┘     └──────────────────┘     └───────────────┘     └──────────────┘
     │                     │                      │                       │
     │                     ▼                      ▼                       ▼
     │              ┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
     │              │ Ticket Parser│     │ Quality Gates:   │     │ Slack/Asana   │
     │              │ + Router     │     │ tsc → lint →     │     │ Notification  │
     │              │ (which agent)│     │ test → security  │     │               │
     │              └──────────────┘     └──────────────────┘     └───────────────┘
```

### Why This Architecture (Not Temporal)

You said 1 week. Temporal is the "right" long-term answer but requires:
- Self-hosted cluster setup (2-3 days alone)
- Worker infrastructure
- Monitoring layer

**n8n Cloud is already running and can do 90% of what you need.** It handles webhooks, HTTP calls, branching logic, error handling, retries, and Slack/Asana integrations natively. You lose durable replay on crash (Temporal's killer feature), but for v1 that's an acceptable tradeoff. **Graduate to Temporal in month 2 if volume demands it.**

---

## Agent Selection Strategy

Not all tickets are equal. Route different work to different agents:

| Ticket Type | Primary Agent | Why | Fallback |
|-------------|--------------|-----|----------|
| **Bug fixes / small patches** | GitHub Copilot Coding Agent | Zero infra — assign issue to `@copilot`, get PR back | Claude Code CLI |
| **New features from specs** | Claude Code CLI (headless) | Best at reasoning over complex specs, TypeScript native | Codex CLI |
| **Refactoring / tech debt** | Claude Code CLI | Needs deep codebase understanding | Aider (cheaper for bulk) |
| **Test coverage** | Claude Code CLI or Codex CLI | Both strong at test generation | Copilot |

### Agent Capabilities Quick Reference

| Capability | Claude Code CLI | Codex CLI | Copilot Agent | Cursor |
|-----------|----------------|-----------|---------------|--------|
| Headless mode | ✅ `claude -p` | ✅ `codex exec --full-auto` | ✅ Assign to `@copilot` | ❌ IDE only |
| Programmatic trigger | ✅ SDK + CLI | ✅ CLI | ⚠️ Issue assignment only | ❌ |
| GitHub Action | ✅ Official | ✅ Community | ✅ Native | ❌ |
| Sandbox built-in | ⚠️ Uses host | ✅ Docker | ✅ GitHub infra | N/A |
| TypeScript strength | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Cost per task | ~$1-5 (API) | ~$1-3 (API) | Included in Copilot sub | Subscription |

---

## Day 1: Foundation — CLAUDE.md + GitHub Action + First Manual Run

### Morning: Write Your CLAUDE.md (2-3 hours)

This is the single highest-ROI investment. Every agent session reads this file. It's your "onboarding doc for AI engineers."

Create `CLAUDE.md` in your repo root:

```markdown
# CLAUDE.md — Mothership Codebase Guide

## Project Overview
[1-2 sentences: what Mothership does, who uses it]

## Tech Stack
- Runtime: Node.js 20+ with TypeScript 5.x (strict mode)
- Framework: [Express/Fastify/Nest — whatever you use]
- Database: [Postgres/Mongo/etc]
- ORM: [Prisma/TypeORM/Drizzle/etc]
- Testing: [Vitest/Jest] with [testing-library if applicable]
- Linting: [ESLint/Biome config location]
- Package manager: [npm/yarn/pnpm]

## Project Structure
```
src/
  modules/        # Feature modules (each has controller, service, types)
  shared/         # Shared utilities, middleware, types
  config/         # Environment config
  database/       # Migrations, seeds
test/
  unit/           # Mirror src/ structure
  integration/    # API-level tests
```

## Common Commands
```bash
npm run build          # TypeScript compilation
npm run test           # Run all tests
npm run test:unit      # Unit tests only
npm run lint           # Lint check
npm run lint:fix       # Auto-fix lint issues
npm run typecheck      # tsc --noEmit
```

## Coding Conventions
- Use `async/await` over raw Promises
- Error handling: [your pattern — e.g., custom error classes, Result types]
- Naming: camelCase for functions/variables, PascalCase for types/classes
- All new code MUST have corresponding tests
- [Any other team conventions]

## Domain Terminology
- [Term 1]: [What it means in your business context]
- [Term 2]: [Definition]
(This is critical — AI agents hallucinate domain terms without this)

## API Patterns
- [How routes are structured]
- [Auth middleware usage]
- [Request validation approach]

## DO NOT
- Modify CI/CD configs (.github/workflows/*, Dockerfile, k8s/)
- Touch auth/authorization modules without explicit approval
- Add new npm dependencies without documenting why
- Modify tsconfig.json or eslint config
- Delete or skip existing tests
```

### Afternoon: Set Up Claude Code GitHub Action (2-3 hours)

This is the fastest path to "issue in → PR out." Claude Code has an official GitHub Action.

**Step 1:** Add Anthropic API key as GitHub secret  
Go to Settings → Secrets → Actions → `ANTHROPIC_API_KEY`

**Step 2:** Create `.github/workflows/ai-coder.yml`:

```yaml
name: AI Coding Agent
on:
  issues:
    types: [opened, labeled]

jobs:
  ai-code:
    # Only run on issues labeled 'ai-task'
    if: contains(github.event.issue.labels.*.name, 'ai-task')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    permissions:
      contents: write
      pull-requests: write
      issues: write
    
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      
      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          model: claude-sonnet-4-20250514
          # Claude reads the issue title + body as the task
          # It will create a branch, write code, run tests, and open a PR
          allowed_tools: |
            Bash(npm run build)
            Bash(npm run test)
            Bash(npm run lint)
            Bash(npm run typecheck)
          max_turns: 50
```

**Step 3:** Test manually  
Create a GitHub issue with label `ai-task`:
- Title: "Fix: [describe a known small bug]"
- Body: Include acceptance criteria, file locations if known

Watch the Action run. Claude will create a branch, write code, and open a PR. Cursor Bot will auto-review it. You review and merge.

**🎯 End of Day 1 deliverable:** You can manually create a labeled GitHub issue and get a PR back with AI-generated code + Cursor Bot review.

---

## Day 2: n8n → Asana Integration (The Ticket Intake Pipeline)

### Build the n8n Workflow: Asana Webhook → GitHub Issue

This bridges Asana tickets to your Day 1 GitHub Action.

**Flow:** Asana ticket moved to "AI Ready" column → n8n webhook fires → n8n creates GitHub Issue with `ai-task` label → GitHub Action triggers Claude Code → PR created

#### n8n Workflow Steps:

**Node 1: Asana Trigger (Webhook)**
- Use n8n's built-in Asana Trigger node
- Configure for your project
- Trigger on: Task moved to section / Task field changed
- Filter: Only tasks in "AI Ready" section (or tagged `ai-ready`)

**Node 2: Asana — Get Task Details**
- Fetch full task details: name, description, custom fields, subtasks
- Extract: title, description, acceptance criteria, related files/modules

**Node 3: Code — Format Prompt**
```javascript
// Transform Asana ticket into a structured GitHub issue body
const task = $input.first().json;

const issueBody = `
## Task
${task.name}

## Description
${task.notes || task.html_notes}

## Acceptance Criteria
${task.custom_fields?.find(f => f.name === 'Acceptance Criteria')?.text_value || 'See description above'}

## Scope
- Only modify files related to this task
- All existing tests must continue to pass
- Add tests for any new functionality
- Follow conventions in CLAUDE.md

## Task ID
Asana: ${task.gid}
`;

// Classify ticket type for agent routing (Phase 2)
const labels = ['ai-task'];
const taskName = task.name.toLowerCase();
if (taskName.includes('bug') || taskName.includes('fix')) {
  labels.push('bug-fix');
} else if (taskName.includes('refactor')) {
  labels.push('refactoring');
} else if (taskName.includes('test')) {
  labels.push('test-coverage');
} else {
  labels.push('feature');
}

return {
  title: task.name,
  body: issueBody,
  labels: labels,
  asanaGid: task.gid
};
```

**Node 4: Ticket Quality Check (Optional but recommended)**
- Use n8n's AI Agent node with Claude
- Prompt: "Does this ticket have clear acceptance criteria and enough detail for a developer to implement? Reply YES or NO with a brief reason."
- If NO → Post a comment on Asana asking for clarification, move to "Needs Info" column, stop workflow

**Node 5: GitHub — Create Issue**
- Use n8n's GitHub node
- Action: Create Issue
- Repository: your repo
- Title: from Node 3
- Body: from Node 3
- Labels: from Node 3

**Node 6: Asana — Update Task**
- Move task to "In Progress (AI)" section
- Add comment: "🤖 AI agent picked up this task. GitHub Issue: [link]"

**Node 7: Slack Notification (Optional)**
- Post to your team channel: "AI agent is working on: [task name]"

### Test the Full Loop

1. Create an Asana task with a clear bug fix description
2. Move it to "AI Ready" column
3. Watch: n8n fires → GitHub Issue created → GitHub Action runs Claude Code → PR appears → Cursor Bot reviews
4. Check Asana: task should be in "In Progress (AI)" with a comment

**🎯 End of Day 2 deliverable:** Asana ticket moved to "AI Ready" → PR appears on GitHub automatically.

---

## Day 3: Quality Gates + Agent Routing

### Morning: Strengthen the Quality Gate Pipeline (2-3 hours)

Upgrade the GitHub Action to enforce strict quality gates before PR creation.

Update `.github/workflows/ai-coder.yml` to add a validation job that runs AFTER Claude creates the PR:

```yaml
  # Add this as a second job triggered on PR creation by the bot
  validate-ai-pr:
    runs-on: ubuntu-latest
    if: github.event.pull_request.user.login == 'github-actions[bot]'
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - run: npm ci
      
      # Gate 1: TypeScript compilation
      - name: Type Check
        run: npx tsc --noEmit --strict
      
      # Gate 2: Lint
      - name: Lint
        run: npm run lint
      
      # Gate 3: All tests pass
      - name: Tests
        run: npm run test -- --coverage
      
      # Gate 4: Security audit
      - name: Security
        run: npm audit --audit-level=high
      
      # Gate 5: Scope validation — AI didn't touch forbidden files
      - name: Scope Check
        run: |
          FORBIDDEN_PATHS=".github/workflows/ Dockerfile docker-compose k8s/ .env tsconfig.json"
          CHANGED=$(git diff --name-only origin/main...HEAD)
          for path in $FORBIDDEN_PATHS; do
            if echo "$CHANGED" | grep -q "^$path"; then
              echo "❌ FORBIDDEN: AI modified $path"
              exit 1
            fi
          done
          echo "✅ Scope check passed"
```

### Afternoon: Multi-Agent Routing in n8n (2-3 hours)

Add a Switch node in your n8n workflow to route tickets to different agents:

**Node 3b: Switch — Route by Ticket Type**

```
Route 1: Label contains "bug-fix"
  → GitHub Issue with label "ai-task" + "copilot-eligible"
  → ALSO: Assign issue to @copilot (fastest for simple bugs)
  
Route 2: Label contains "feature" 
  → GitHub Issue with label "ai-task"
  → Claude Code CLI handles it (default GitHub Action)

Route 3: Label contains "test-coverage"
  → GitHub Issue with label "ai-task" + "test-gen"
  → Claude Code with specific test-generation prompt template

Route 4: Label contains "refactoring"  
  → GitHub Issue with label "ai-task" + "refactor"
  → Claude Code with refactoring-specific constraints
```

For **Copilot Agent routing**, add an additional workflow:

```yaml
# .github/workflows/copilot-assign.yml
name: Assign Simple Bugs to Copilot
on:
  issues:
    types: [labeled]

jobs:
  assign-copilot:
    if: contains(github.event.issue.labels.*.name, 'copilot-eligible')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.addAssignees({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              assignees: ['copilot']
            });
```

**🎯 End of Day 3 deliverable:** Different ticket types route to different agents. Quality gates catch bad AI code before it reaches human review.

---

## Day 4: Feedback Loop + Monitoring

### Morning: Close the Asana Loop (2 hours)

Add a workflow that updates Asana when a PR is created/merged/closed.

**New n8n Workflow: GitHub PR → Asana Update**

**Node 1: GitHub Trigger**
- Trigger on: Pull Request events (opened, closed, merged)

**Node 2: Code — Extract Asana GID**
```javascript
// Parse Asana task ID from PR body
const body = $input.first().json.pull_request.body;
const match = body.match(/Asana:\s*(\d+)/);
return { asanaGid: match ? match[1] : null, prUrl: $input.first().json.pull_request.html_url, action: $input.first().json.action, merged: $input.first().json.pull_request.merged };
```

**Node 3: Switch — PR Event Type**
```
PR Opened → Asana comment: "🤖 PR created: [link]. Awaiting review."
                Move to "AI PR Ready" section
PR Merged → Asana comment: "✅ PR merged and deployed."
                Mark task complete
PR Closed (not merged) → Asana comment: "❌ PR was rejected. Moving back."
                Move to "AI Retry" or "Manual" section
```

**Node 4: Asana — Update Task**
- Use Asana node to update task status/section/comment

**Node 5: Slack — Notify Team**
- On PR created: "🤖 AI PR ready for review: [link] (from Asana: [task name])"
- On merge: "✅ AI task completed: [task name]"
- On rejection: "⚠️ AI PR rejected for [task name] — needs human attention"

### Afternoon: Build a Simple Dashboard (2-3 hours)

Track pipeline health. Use n8n's built-in logging + a Google Sheet or simple webhook to track:

| Metric | How to Track |
|--------|-------------|
| Tasks attempted | n8n execution count |
| PRs created | GitHub webhook count |
| PRs merged (first attempt) | GitHub merged + no re-request-review events |
| PRs rejected | GitHub PR closed without merge |
| Avg time: ticket → PR | Timestamp diff in n8n |
| Agent used | Label on GitHub issue |
| Cost per task | Anthropic API usage dashboard |

**Simple approach:** Add a "Log to Google Sheet" node at each stage of your n8n workflows. After a week you'll have data to optimize.

**Metrics that matter most:**
1. **First-attempt success rate** — PRs merged without changes. Target: >50% for bug fixes, >30% for features in week 1
2. **Time to PR** — From Asana move to PR creation. Target: <30 minutes for simple tasks
3. **Cost per merged PR** — API costs ÷ merged PRs. Target: <$5/PR

**🎯 End of Day 4 deliverable:** Full bidirectional sync between Asana and GitHub. Slack notifications. Basic metrics tracking.

---

## Day 5: Hardening + Parallel Execution + Documentation

### Morning: Enable Parallel Processing (2 hours)

By default, n8n Cloud can run multiple workflow executions concurrently. But you need to ensure:

1. **Each agent run gets its own branch** — Already handled by Claude Code Action (creates unique branch per issue)
2. **No resource conflicts** — GitHub Actions runs in isolated containers
3. **Rate limiting** — Add a Queue node in n8n to limit concurrent AI tasks to 3-5 (avoid burning through API credits)

**n8n Queue pattern:**
```
Asana Trigger → Check concurrent runs (HTTP request to n8n API) 
  → If < 5 running: proceed to Create Issue
  → If >= 5: Wait node (5 min) → retry
```

### Morning: Add Retry Logic (1 hour)

If the GitHub Action fails (tests don't pass, lint errors), add retry:

```yaml
# In ai-coder.yml, add retry with refined prompt
- name: Run Claude Code (Retry)
  if: failure()
  uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-sonnet-4-20250514
    prompt: |
      The previous attempt failed. Check the error logs above.
      Fix the issues and try again. Focus on:
      1. Making all existing tests pass
      2. Fixing any TypeScript type errors
      3. Fixing any lint violations
    max_turns: 30
```

### Afternoon: Prompt Templates Library (2-3 hours)

Create prompt templates for each ticket type. Store in repo as `/.ai/prompts/`:

**`/.ai/prompts/bug-fix.md`:**
```markdown
## Bug Fix Task

You are fixing a bug in the Mothership codebase.

### Instructions
1. Read the bug description carefully
2. Find the root cause — don't just fix the symptom
3. Write a failing test FIRST that reproduces the bug
4. Fix the code to make the test pass
5. Verify all existing tests still pass
6. Keep changes minimal — only touch what's necessary

### Checklist before creating PR
- [ ] Root cause identified and documented in PR description
- [ ] Regression test added
- [ ] All existing tests pass
- [ ] TypeScript compiles with no errors
- [ ] No lint warnings
```

**`/.ai/prompts/feature.md`:**
```markdown
## Feature Implementation Task

You are implementing a new feature in the Mothership codebase.

### Instructions
1. Read the full spec / acceptance criteria
2. Plan your approach — list files you'll create or modify
3. Follow existing patterns in the codebase (check similar modules)
4. Write types/interfaces first
5. Implement the feature
6. Write comprehensive tests (unit + integration if applicable)
7. Update any relevant documentation

### Constraints
- Do NOT add new npm dependencies without documenting why in the PR
- Follow the patterns in CLAUDE.md
- Keep functions small and testable
- Handle error cases explicitly
```

**`/.ai/prompts/refactor.md`** and **`/.ai/prompts/test-coverage.md`** — similar structure.

Reference these in your GitHub Action:

```yaml
- name: Run Claude Code
  uses: anthropics/claude-code-action@v1
  with:
    prompt: |
      Read the prompt template at .ai/prompts/${{ env.TASK_TYPE }}.md
      Then complete the following task:
      ${{ github.event.issue.body }}
```

### Afternoon: Write the Runbook (1 hour)

Document for your CTO and team:

```markdown
# AI Coding Pipeline — Runbook

## How to Submit Work to AI
1. Create Asana task with clear title and description
2. Add acceptance criteria (critical — vague tickets get rejected)
3. Move task to "AI Ready" column
4. AI picks it up within 2-3 minutes

## What Happens Next
1. n8n creates a GitHub Issue labeled `ai-task`
2. GitHub Action runs Claude Code / Copilot agent
3. Agent creates a branch, writes code, runs tests
4. PR is created with full description
5. Cursor Bot auto-reviews the PR
6. Slack notification sent to #ai-prs channel
7. Human reviews and merges (or requests changes)
8. Asana task auto-updates throughout

## When to Use AI vs. Human
✅ Good for AI: Bug fixes, CRUD features, test writing, refactoring, migrations
⚠️ Maybe: Complex business logic, multi-service changes, performance optimization
❌ Not yet: Auth/security changes, DB schema changes, infra/CI changes

## Troubleshooting
- AI PR has test failures → It will auto-retry once. If still failing, close PR and reassign manually
- n8n workflow failed → Check n8n execution log, usually a webhook timeout
- Cost concerns → Check Anthropic dashboard, daily spend should be <$50
```

**🎯 End of Day 5 deliverable:** Parallel execution, retry logic, prompt templates, documented runbook. System is production-ready for your team.

---

## Week 1 Summary: What You'll Have

```
ASANA                    n8n CLOUD                 GITHUB                    HUMAN
─────                    ─────────                 ──────                    ─────
Task created      ─┐
                   │
Move to            │
"AI Ready"  ──────▶│──▶ Parse ticket
                   │    Classify type
                   │    Quality check
                   │    Route to agent ──────▶ Create Issue
                   │                          (labeled ai-task)
                   │                                │
                   │                          GitHub Action
                   │                          runs Claude Code
                   │                          or assigns @copilot
                   │                                │
                   │                          Agent writes code
                   │                          Runs tests
                   │                          Creates PR ──────────▶ Review PR
                   │                                │                 Approve
                   │                          Cursor Bot              Merge
                   │                          auto-reviews            │
                   │                                │                 │
Task updated  ◀────│──◀ PR status webhook ◀─────────┘                 │
"Complete"    ◀────│──◀ Merge webhook ◀───────────────────────────────┘
```

## Estimated Costs

| Item | Monthly Cost |
|------|-------------|
| Anthropic API (Claude Code, ~20 tasks/day) | $200-600 |
| n8n Cloud (already have) | $0 additional |
| GitHub Actions minutes | ~$50-100 |
| GitHub Copilot (already have) | $0 additional |
| Cursor Bot (already have) | $0 additional |
| **Total** | **~$250-700/month** |

## Upgrade Path (Month 2+)

| When | Upgrade |
|------|---------|
| >50 tasks/day | Move orchestration to Temporal for durable execution |
| Low first-attempt success | Add Greptile API for deeper codebase context ($0.15/query) |
| Need second review model | Add CodeRabbit ($24/dev/mo) alongside Cursor Bot |
| Complex multi-step features | Add LangGraph for multi-step agent reasoning |
| Self-hosted agents | Move to dedicated VM with Docker+gVisor sandboxing |
| Deployment safety | Add Argo Rollouts canary for AI-generated code |
