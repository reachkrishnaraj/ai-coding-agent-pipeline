# AI Coding Pipeline — Specification Document

**Version:** 2.1
**Hosting:** Railway (container)
**Interface:** Web UI + Slack
**State:** Persistent (PostgreSQL)
**Agents:** Claude Code + Codex + Copilot
**Auth:** GitHub OAuth (org-wide)
**Scope:** mothership/* repos only
**Agent Selection:** LLM recommends, user can override before dispatch
**System Prompt:** Per-repo, read from the repo's `.ai/` directory
**Approval:** Auto-dispatch (no manual approval step)
**Real-time:** Auto-refresh polling (30s)
**Cost Tracking:** v2 (not in MVP)

---

## 1. Overview

A cloud-hosted service that manages the full lifecycle of AI coding tasks: intake, LLM analysis, clarification Q&A, GitHub Issue creation, agent monitoring, and PR tracking. Everything runs in the cloud — nothing local.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR APP (Railway)                                │
│                                                                     │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ Web UI  │  │ Slack   │  │  LLM     │  │ GitHub   │  │ State │ │
│  │ (React/ │  │ Bot     │  │ Analyze  │  │ Issues   │  │ (PG)  │ │
│  │ Next.js)│  │         │  │ (OpenAI) │  │ + PRs    │  │       │ │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └────┬─────┘  └───┬───┘ │
│       │            │            │              │             │      │
│       └────────────┴────────────┴──────────────┴─────────────┘      │
│                          REST API                                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                          GitHub Issue created
                          (with labels)
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GITHUB ACTIONS (Compute)                       │
│                                                                     │
│  Label: ai-task             → ai-coder.yml     → Claude Code       │
│  Label: ai-task + codex     → ai-coder-codex.yml → Codex CLI      │
│  Label: copilot-eligible    → copilot-assign.yml → Copilot Agent   │
│  PR opened by bot           → ai-validate-pr.yml → Quality gates   │
│                                                                     │
│  Agent: reads issue → writes code → runs tests → creates PR        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. User Journeys

### Journey 1: Web UI

1. User opens `https://ai-pipeline.up.railway.app`
2. Sees dashboard with task list, statuses, and a "New Task" button
3. Fills in: description, type, repo, files, acceptance criteria
4. Clicks submit → LLM analyzes → if unclear, shows follow-up questions inline
5. User answers questions → re-analyzes → creates GitHub Issue
6. Dashboard updates: task status moves from `analyzing` → `dispatched` → `coding` → `pr_open` → `merged`
7. User clicks the PR link to review

### Journey 2: Slack

1. User types `/ai-task Fix the payment status bug in finance-service`
2. Bot responds: "Analyzing your task..."
3. Bot DMs: "I have 2 questions before I send this to the agent: ..."
4. User replies in thread
5. Bot: "Got it. Issue created: github.com/mothership/finance-service/issues/42. Claude Code is on it."
6. Later: "PR ready for review: github.com/mothership/finance-service/pull/43"

### Journey 3: API (curl)

1. `curl -X POST https://ai-pipeline.up.railway.app/api/tasks -d '{"description": "..."}'`
2. Returns JSON with issue URL and task ID
3. Poll `GET /api/tasks/{id}` for status updates

---

## 3. Database Schema (PostgreSQL)

### 3.1 tasks

```sql
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(20) NOT NULL,           -- 'web' | 'slack' | 'api' | 'asana'
  status          VARCHAR(30) NOT NULL DEFAULT 'received',
  -- Status flow: received → analyzing → needs_clarification → dispatched → coding → pr_open → merged | failed

  -- User input
  description     TEXT NOT NULL,
  task_type_hint  VARCHAR(30),                    -- User's hint, nullable
  repo            VARCHAR(200) NOT NULL DEFAULT 'mothership/finance-service',
  files_hint      TEXT,                           -- Comma-separated
  acceptance_criteria TEXT,
  priority        VARCHAR(10) NOT NULL DEFAULT 'normal',

  -- LLM analysis
  llm_analysis    JSONB,                          -- Full LLM response stored as JSON
  llm_summary     TEXT,                           -- One-sentence summary (becomes issue title)
  task_type       VARCHAR(30),                    -- LLM-detected: bug-fix | feature | refactor | test-coverage
  recommended_agent VARCHAR(20),                  -- claude-code | codex | copilot
  likely_files    JSONB,                          -- Array of file paths
  suggested_criteria JSONB,                       -- Array of acceptance criteria strings

  -- Clarification
  clarification_questions JSONB,                  -- Array of question strings from LLM
  clarification_answers   JSONB,                  -- Array of answer strings from user
  is_clarified    BOOLEAN NOT NULL DEFAULT FALSE,

  -- GitHub
  github_issue_number INTEGER,
  github_issue_url    TEXT,
  github_pr_number    INTEGER,
  github_pr_url       TEXT,
  github_pr_status    VARCHAR(20),                -- 'open' | 'merged' | 'closed'
  github_branch       VARCHAR(200),

  -- Slack
  slack_user_id       VARCHAR(30),
  slack_channel_id    VARCHAR(30),
  slack_thread_ts     VARCHAR(30),

  -- Meta
  created_by      VARCHAR(100),                   -- Email or Slack user ID
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at   TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_repo ON tasks(repo);
CREATE INDEX idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX idx_tasks_github_issue ON tasks(github_issue_number) WHERE github_issue_number IS NOT NULL;
```

### 3.2 task_events (audit log)

```sql
CREATE TABLE task_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id),
  event_type  VARCHAR(50) NOT NULL,
  -- Event types: created, analyzing, llm_response, clarification_sent, clarification_received,
  --              dispatched, agent_started, agent_question, agent_answer, pr_opened,
  --              pr_review_requested, pr_merged, pr_closed, failed
  payload     JSONB,                              -- Event-specific data
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_task ON task_events(task_id, created_at);
```

---

## 4. API Specification

### 4.1 Tasks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/tasks` | Create a new task (JSON body) |
| `GET`  | `/api/tasks` | List tasks (paginated, filterable by status/repo) |
| `GET`  | `/api/tasks/:id` | Get task detail with event timeline |
| `POST` | `/api/tasks/:id/clarify` | Submit clarification answers |
| `POST` | `/api/tasks/:id/retry` | Retry a failed task |
| `DELETE`| `/api/tasks/:id` | Cancel a task (if not yet dispatched) |

#### POST /api/tasks

**Request:**

```json
{
  "description": "Fix payment status not updating to Succeeded after Stripe webhook fires",
  "type": "bug-fix",
  "repo": "mothership/finance-service",
  "files": ["src/modules/customer-payment/"],
  "acceptanceCriteria": "Payment updates to Succeeded, succeededAt is set",
  "priority": "normal"
}
```

**Response (201):**

```json
{
  "id": "a1b2c3d4-...",
  "status": "analyzing",
  "message": "Task received. Analyzing with LLM..."
}
```

If the LLM analysis completes synchronously (fast path):

```json
{
  "id": "a1b2c3d4-...",
  "status": "dispatched",
  "issue_url": "https://github.com/mothership/finance-service/issues/42",
  "issue_number": 42,
  "title": "Fix Stripe webhook handler to update payment status",
  "agent": "claude-code",
  "task_type": "bug-fix"
}
```

If clarification is needed:

```json
{
  "id": "a1b2c3d4-...",
  "status": "needs_clarification",
  "questions": [
    "What is the current payment status value when the webhook fires?",
    "Are there any error logs when this happens?"
  ]
}
```

#### POST /api/tasks/:id/clarify

```json
{
  "answers": [
    "It stays as 'Processing' — never changes",
    "No errors in the logs, it just silently skips the update"
  ]
}
```

#### GET /api/tasks

```
GET /api/tasks?status=dispatched&repo=mothership/finance-service&page=1&limit=20
```

```json
{
  "tasks": [...],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

#### GET /api/tasks/:id

```json
{
  "id": "a1b2c3d4-...",
  "status": "pr_open",
  "description": "Fix payment status...",
  "llm_summary": "Fix Stripe webhook handler...",
  "task_type": "bug-fix",
  "agent": "claude-code",
  "repo": "mothership/finance-service",
  "github_issue_url": "https://github.com/.../issues/42",
  "github_pr_url": "https://github.com/.../pull/43",
  "github_pr_status": "open",
  "events": [
    { "type": "created", "at": "2026-02-14T10:00:00Z" },
    { "type": "llm_response", "at": "2026-02-14T10:00:03Z", "payload": { "task_type": "bug-fix" } },
    { "type": "dispatched", "at": "2026-02-14T10:00:04Z", "payload": { "issue_number": 42 } },
    { "type": "pr_opened", "at": "2026-02-14T10:12:00Z", "payload": { "pr_number": 43 } }
  ]
}
```

### 4.2 Webhooks (Inbound)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/webhooks/slack` | Slack slash commands + events |
| `POST` | `/api/webhooks/github` | GitHub PR + issue comment events |

#### POST /api/webhooks/github

Receives GitHub webhook events. Configure in repo Settings → Webhooks:
- **URL:** `https://ai-pipeline.up.railway.app/api/webhooks/github`
- **Events:** Pull requests, Issue comments

**Handles:**

| Event | Action |
|-------|--------|
| PR opened (by bot) | Update task status → `pr_open`, notify Slack |
| PR merged | Update task status → `merged`, notify Slack |
| PR closed (not merged) | Update task status → `failed`, notify Slack |
| Issue comment (by bot) | Relay agent's question to Slack user |

#### POST /api/webhooks/slack

**Slash command:** `/ai-task Fix the payment status bug`

**Thread reply (clarification answer):** Slack sends event when user replies in the Q&A thread. App matches `thread_ts` to the task and calls `POST /api/tasks/:id/clarify`.

### 4.3 Web UI

| Route | Purpose |
|-------|---------|
| `GET /` | Dashboard — task list with status badges |
| `GET /tasks/new` | New task form |
| `GET /tasks/:id` | Task detail — timeline, GitHub links, Q&A history |

### 4.4 Health

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/health` | Returns `{ "status": "ok", "db": "connected" }` |

---

## 5. Task State Machine

```
                 ┌───────────┐
                 │ received  │
                 └─────┬─────┘
                       │ Call LLM
                       ▼
                 ┌───────────┐
                 │ analyzing │
                 └─────┬─────┘
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
   ┌──────────────────┐  ┌───────────┐
   │needs_clarification│  │dispatched │ ◄─── (also after clarification)
   └────────┬─────────┘  └─────┬─────┘
            │                   │ GitHub Issue created
            │ User answers      │ Agent picks up
            │ → Re-analyze      ▼
            │              ┌──────────┐
            └─────────────▶│  coding  │
                           └─────┬────┘
                                 │
                                 ▼
                           ┌──────────┐
                           │ pr_open  │
                           └─────┬────┘
                                 │
                        ┌────────┴────────┐
                        ▼                 ▼
                  ┌──────────┐     ┌──────────┐
                  │  merged  │     │  failed  │
                  └──────────┘     └──────────┘
```

---

## 6. LLM Integration

### 6.1 Provider: OpenAI

- **Endpoint:** `POST https://api.openai.com/v1/chat/completions`
- **Model:** `gpt-4o`
- **Auth:** `Authorization: Bearer {OPENAI_API_KEY}`

### 6.2 System Prompt

```
You are a senior engineering lead reviewing tasks before they go to an AI coding agent.
The agent works on Mothership microservices — primarily the Finance Service
(NestJS/TypeScript, CQRS architecture, Prisma ORM, Vitest testing, Biome linting).
It handles customer payments, invoices, refunds, vendor bills, Stripe integration,
and NetSuite sync.

Your job:
1. Analyze the task for clarity and completeness
2. Identify any ambiguities, missing acceptance criteria, or unclear scope
3. Generate clarifying questions if needed (max 3 questions)
4. Classify the task type: bug-fix, feature, refactor, or test-coverage
5. Recommend which agent should handle it: claude-code (complex), codex (quick), or copilot (simple bugs)
6. Extract or infer the target repo (default: mothership/finance-service)

Respond in this exact JSON format only — no markdown, no explanation:
{
  "clear_enough": true/false,
  "questions": ["question 1", "question 2"],
  "task_type": "bug-fix|feature|refactor|test-coverage",
  "recommended_agent": "claude-code|codex|copilot",
  "summary": "One-sentence summary of what needs to be done",
  "suggested_acceptance_criteria": ["criterion 1", "criterion 2"],
  "likely_files": ["src/modules/...", "src/libs/..."],
  "repo": "mothership/finance-service"
}
```

### 6.3 Response Parsing

Parse `response.choices[0].message.content` as JSON. Strip markdown code fences if present. On failure, use fallback: `{ clear_enough: false, task_type: "bug-fix", recommended_agent: "claude-code" }`.

---

## 7. GitHub Integration

### 7.1 Create Issue

- **Endpoint:** `POST https://api.github.com/repos/{owner}/{repo}/issues`
- **Auth:** `Authorization: Bearer {GITHUB_TOKEN}`
- **Headers:** `Accept: application/vnd.github+v3+json`

**Body:**

```json
{
  "title": "{llm_summary}",
  "body": "{structured markdown — see section 7.3}",
  "labels": ["ai-task", "{task_type}"]
}
```

### 7.2 Agent Routing (via labels)

| Labels | Agent | GitHub Action | Use Case |
|--------|-------|---------------|----------|
| `ai-task` | Claude Code | `ai-coder.yml` | Complex tasks: features, refactors, multi-file changes |
| `ai-task` + `codex` | OpenAI Codex | `ai-coder-codex.yml` | Quick code generation: boilerplate, tests, simple features |
| `copilot-eligible` | GitHub Copilot | `copilot-assign.yml` | Simple bugs: typos, one-line fixes, small patches |

### 7.3 Issue Body Template

```markdown
## Task
{llm_summary}

## Description
{user_description}

## Acceptance Criteria
- [ ] {criterion_1}
- [ ] {criterion_2}

## Likely Files
- `{file_1}`
- `{file_2}`

## Agent Instructions
- Task type: **{task_type}**
- Read prompt template: `.ai/prompts/{task_type}.md`
- This task has been pre-clarified. All questions have been answered.
- Proceed directly to implementation. Do NOT ask clarifying questions.

## Scope
- Only modify files related to this task
- All existing tests must continue to pass
- Add tests for any new functionality
- Follow conventions in CLAUDE.md

## Clarification Q&A
{question_1}
> {answer_1}

{question_2}
> {answer_2}

---
*Created by AI Pipeline | Task ID: {task_id} | Source: {source}*
```

---

## 8. Slack Integration

### 8.1 Slash Command

- **Command:** `/ai-task`
- **Request URL:** `https://ai-pipeline.up.railway.app/api/webhooks/slack`
- **Usage:** `/ai-task Fix the payment status bug in finance-service`

### 8.2 Clarification Flow

When LLM returns `clear_enough: false`:

1. Bot DMs user with questions (using `chat.postMessage`)
2. User replies in thread
3. App receives thread reply event (requires Event Subscriptions: `message.im`)
4. App matches `thread_ts` to task → calls clarify endpoint → re-analyzes → creates issue

### 8.3 Notifications

| Event | Slack Message |
|-------|---------------|
| Task dispatched | "Task dispatched to {agent}. Issue: {url}" |
| PR opened | "PR ready for review: {pr_url}" |
| PR merged | "Done! {pr_url} has been merged." |
| PR closed (rejected) | "PR needs attention: {pr_url}" |
| Agent asks question | "The agent has a question about your task: {question}" |

### 8.4 Required Slack Scopes

- `chat:write` — Send DMs
- `commands` — Slash commands
- `im:history` — Read DM thread replies
- `im:write` — Open DM channels

---

## 9. Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:5432/ai_pipeline

# LLM
OPENAI_API_KEY=sk-...

# GitHub
GITHUB_TOKEN=ghp_...                    # Classic PAT with repo scope
GITHUB_WEBHOOK_SECRET=whsec_...         # For verifying webhook payloads
DEFAULT_REPO=mothership/finance-service

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...                # For verifying Slack requests
SLACK_DEFAULT_USER_ID=U0A6VN4J3PW
```

---

## 10. Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **Runtime** | Node.js 20 + TypeScript 5 | Matches Mothership stack |
| **Framework** | NestJS 11 | Matches Finance Service, structured, built-in validation |
| **Database** | PostgreSQL 16 | Railway provides managed Postgres |
| **ORM** | Prisma 6 | Matches Finance Service |
| **Frontend** | React + Tailwind (or Next.js) | Simple dashboard, could be a separate SPA or server-rendered |
| **Hosting** | Railway | Container deployment, managed Postgres, $5/mo, deploy from GitHub |
| **Queue** | Bull + Redis (v2) | For async LLM calls and retries. Skip for MVP — synchronous is fine |

---

## 11. Implementation Phases

### Phase 1: Core API + Database (day 1)

- NestJS app with Prisma + PostgreSQL
- `POST /api/tasks` — create task, call OpenAI, create GitHub Issue
- `GET /api/tasks` — list tasks
- `GET /api/tasks/:id` — task detail with events
- `GET /api/health`
- Deploy to Railway
- **Test:** `curl -X POST .../api/tasks -d '{"description": "Fix payment bug"}'`

### Phase 2: Clarification Flow (day 1-2)

- `POST /api/tasks/:id/clarify` — answer questions, re-analyze, dispatch
- Task status machine: received → analyzing → needs_clarification → dispatched
- Store Q&A in database

### Phase 3: Web UI (day 2-3)

- Dashboard: task list with status badges
- New task form
- Task detail page: timeline, Q&A inline, GitHub links
- Could be a simple Next.js app or a separate React SPA

### Phase 4: Slack Integration (day 3-4)

- Slash command handler
- DM Q&A flow with thread replies
- Notifications on PR events

### Phase 5: GitHub Webhooks (day 4-5)

- `POST /api/webhooks/github` — receive PR events and issue comments
- Update task status automatically (coding → pr_open → merged)
- Relay agent questions to Slack

### Phase 6: Polish (day 5+)

- Retry failed tasks
- Cancel tasks
- Dashboard filters and search
- Metrics: success rate, avg time to PR, LLM token costs
- Multi-repo selector in the UI

---

## 12. Project Structure

```
ai-pipeline/
├── src/
│   ├── main.ts                       # NestJS bootstrap
│   ├── app.module.ts                 # Root module
│   │
│   ├── tasks/                        # Tasks domain
│   │   ├── tasks.module.ts
│   │   ├── tasks.controller.ts       # REST endpoints
│   │   ├── tasks.service.ts          # Core business logic
│   │   ├── tasks.gateway.ts          # WebSocket for real-time UI updates (optional)
│   │   ├── dto/
│   │   │   ├── create-task.dto.ts
│   │   │   ├── clarify-task.dto.ts
│   │   │   └── task-query.dto.ts
│   │   └── entities/
│   │       └── task.entity.ts        # Prisma model
│   │
│   ├── llm/                          # LLM integration
│   │   ├── llm.module.ts
│   │   ├── llm.service.ts            # Call OpenAI, parse response
│   │   └── prompts/
│   │       └── analyze-task.prompt.ts # System prompt template
│   │
│   ├── github/                       # GitHub integration
│   │   ├── github.module.ts
│   │   ├── github-issues.service.ts  # Create issues
│   │   ├── github-webhook.controller.ts  # Receive PR/comment events
│   │   └── templates/
│   │       └── issue-body.template.ts
│   │
│   ├── slack/                        # Slack integration
│   │   ├── slack.module.ts
│   │   ├── slack.service.ts          # Send DMs, notifications
│   │   └── slack-webhook.controller.ts  # Slash commands, event callbacks
│   │
│   └── common/
│       ├── config/
│       │   └── configuration.ts      # Environment variable validation
│       └── filters/
│           └── http-exception.filter.ts
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   └── migrations/
│
├── web/                              # Frontend (React or Next.js)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.tsx             # Dashboard
│   │   │   ├── tasks/new.tsx         # New task form
│   │   │   └── tasks/[id].tsx        # Task detail
│   │   └── components/
│   │       ├── TaskList.tsx
│   │       ├── TaskTimeline.tsx
│   │       ├── TaskForm.tsx
│   │       └── StatusBadge.tsx
│   └── package.json
│
├── Dockerfile
├── docker-compose.yml                # Local dev with Postgres
├── railway.toml                      # Railway config
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 13. Key Business Rules

1. **Default repo** is `mothership/finance-service` when none specified
2. **Task type** is auto-detected by the LLM if not provided by user
3. **Agent routing** via labels: claude-code (complex), codex (quick), copilot (simple) — LLM decides
4. **No GitHub assignees** — routing is label-based only
5. **Pre-clarified flag** in issue body tells the coding agent not to ask questions
6. **Clarification loop**: max 1 round of Q&A (max 3 questions). If still unclear after answers, dispatch anyway with a note
7. **Idempotency**: If a task already has a GitHub issue, don't create another one. Use `github_issue_number IS NOT NULL` check
8. **Webhook verification**: Validate GitHub webhook signatures (`X-Hub-Signature-256`) and Slack signing secrets

---

## 14. Error Handling

| Scenario | Behavior |
|----------|----------|
| OpenAI API fails | Set task status to `failed`, store error, allow retry via `POST /api/tasks/:id/retry` |
| OpenAI returns unparseable response | Use fallback analysis, dispatch with raw description |
| GitHub Issue creation fails | Set task status to `failed`, store error, allow retry |
| GitHub 404 (repo not found) | Return 400: "Repository not found. Check the repo name and token permissions." |
| GitHub 422 (validation) | Set task status to `failed`, store GitHub's error message |
| Slack DM fails | Log warning, continue — Slack is not blocking |
| Duplicate dispatch | Check `github_issue_number` before creating. If exists, return existing issue URL |
| Database connection lost | Health check returns unhealthy, Railway auto-restarts |

---

## 15. Railway Deployment

### railway.toml

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"

[service]
internalPort = 3000
```

### Required Railway Services

1. **App** — Your NestJS container (deploy from GitHub)
2. **PostgreSQL** — Railway managed Postgres (click "New" → "Database" → "PostgreSQL")
3. **Redis** — (v2, for Bull queues. Skip for MVP)

### Setup Steps

1. Create Railway project
2. Add PostgreSQL service → copy `DATABASE_URL`
3. Connect GitHub repo → Railway auto-deploys on push
4. Set environment variables in Railway dashboard
5. Run `npx prisma migrate deploy` (Railway can run this as a deploy command)

---

## 16. Authentication & Authorization

### 16.1 GitHub OAuth

- Users sign in with their GitHub account
- Use GitHub OAuth App (not GitHub App) for simplicity
- **Scopes:** `read:user`, `read:org`
- On login, verify the user belongs to the `mothership` GitHub org
- Reject users who are not members of `mothership`
- Store session in a signed cookie (or JWT)

### 16.2 Authorization Rules

| Action | Who Can Do It |
|--------|---------------|
| View dashboard / task list | Any `mothership` org member |
| Create a task | Any `mothership` org member |
| Answer clarification questions | Task creator only |
| Retry a failed task | Task creator only |
| Cancel a task | Task creator only |
| View any task detail | Any `mothership` org member |

### 16.3 Slack Identity Mapping

When a user submits a task via Slack, map their Slack user ID to their GitHub username (stored in the `users` table or fetched via Slack → email → GitHub lookup). This links Slack Q&A to the correct dashboard user.

---

## 17. Per-Repo System Prompt

### 17.1 How It Works

When a task targets `mothership/some-service`, the app fetches the repo's AI config:

1. Call GitHub API: `GET /repos/mothership/some-service/contents/.ai/prompts/system.md`
2. If the file exists, use its content as the system prompt for the LLM analysis
3. If the file doesn't exist, fall back to the default system prompt (hardcoded)
4. Cache the result for 1 hour (avoid repeated API calls)

### 17.2 Repo Config File

Each repo can optionally have `.ai/prompts/system.md`:

```markdown
You are a senior engineering lead reviewing tasks for the {repo_name} service.

{service-specific context here — tech stack, architecture, conventions}

Your job:
1. Analyze the task for clarity and completeness
...
```

### 17.3 Fallback

If no repo-level prompt exists, use the default prompt (section 6.2) which describes the Finance Service. This ensures the pipeline works for any `mothership/*` repo out of the box.

---

## 18. Agent Override

### 18.1 Flow

1. User submits task
2. LLM analyzes and recommends an agent (e.g., `claude-code`)
3. If auto-dispatch: issue is created immediately with the LLM's recommendation
4. In the Web UI task detail page, user sees the recommended agent with the option to change it
5. If user changes agent BEFORE the issue is created (during clarification flow), the new agent is used
6. If the issue is already created, user can re-label the issue (stretch goal — requires GitHub API call to update labels)

### 18.2 UI

In the "New Task" form and in the clarification page:

```
Recommended Agent: [Claude Code ▾]
                    ├── Claude Code (complex tasks)     ← LLM recommended
                    ├── Codex (quick generation)
                    └── Copilot (simple bugs)
```

User can change the dropdown before submitting. Default is the LLM recommendation.

---

## 19. Security

| Concern | Mitigation |
|---------|-----------|
| Unauthorized access | GitHub OAuth — must be `mothership` org member |
| GitHub webhook spoofing | Verify `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET` |
| Slack request spoofing | Verify `X-Slack-Signature` with `SLACK_SIGNING_SECRET` |
| API abuse | Rate limiting on `/api/tasks` (10 req/min per user) |
| Cross-org access | Validate repo starts with `mothership/` before any GitHub API call |
| Secret exposure | All secrets in Railway env vars, never in code |
| SQL injection | Prisma ORM handles parameterized queries |
| LLM prompt injection | System prompt is server-side, user input goes in user message only |
| Session hijacking | Signed HTTP-only cookies, CSRF protection |
