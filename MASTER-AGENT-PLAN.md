# AI Coding Pipeline — Master Agent Build Plan

## Context

You are the master agent coordinating the build of an AI Coding Pipeline application. The full specification is in `SPEC.md` (same directory as this file). Read it thoroughly before starting.

**What this app does:** Users submit coding tasks via a web UI or Slack. The app analyzes the task with OpenAI gpt-4o, optionally asks clarifying questions, creates a well-structured GitHub Issue with labels, and GitHub Actions agents (Claude Code, Codex, Copilot) automatically pick up the issue and write code, run tests, and open PRs.

**Tech stack:** NestJS 11, TypeScript 5, Prisma 6, PostgreSQL 16, React + Tailwind (frontend), pnpm

**Hosting:** Railway (container + managed Postgres)

---

## Pre-requisites (Do This First)

Before launching any agent sessions, complete this setup:

### 1. Scaffold the project

```bash
cd /Users/krishna/workarea/coding
mkdir ai-pipeline && cd ai-pipeline
npx @nestjs/cli new . --package-manager pnpm --language typescript
```

### 2. Install core dependencies

```bash
pnpm add @prisma/client @nestjs/config @nestjs/passport passport passport-github2 @octokit/rest openai class-validator class-transformer
pnpm add -D prisma @types/passport-github2
```

### 3. Copy the spec into the repo

```bash
cp /Users/krishna/workarea/coding/00_ai-collaboration-area/task/ai-pipeline/SPEC-ai-coding-pipeline.md ./SPEC.md
```

### 4. Create CLAUDE.md

Create `CLAUDE.md` in the project root with this content:

```markdown
# AI Pipeline — Agent Onboarding

## What This Is
A cloud-hosted service that manages AI coding tasks. See SPEC.md for the full specification.

## Tech Stack
- NestJS 11, TypeScript 5, Prisma 6, PostgreSQL 16
- React + Tailwind CSS (frontend in /web)
- pnpm package manager

## Conventions
- Follow NestJS module structure (module, controller, service, dto, entity)
- Use Prisma for all database access
- Use class-validator for DTO validation
- Environment variables via @nestjs/config — never hardcode secrets
- All API routes under /api/*
- All webhook routes under /api/webhooks/*
- Use proper HTTP status codes (201 for created, 400 for bad input, 502 for upstream failures)
```

### 5. Initialize Prisma

```bash
npx prisma init --datasource-provider postgresql
```

### 6. Create .env.example

```
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_pipeline
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_WEBHOOK_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_USER_ID=U0A6VN4J3PW
DEFAULT_REPO=mothership/finance-service
SESSION_SECRET=random-string-here
```

### 7. Push to GitHub

```bash
git add -A && git commit -m "chore: scaffold NestJS project with Prisma"
git remote add origin git@github.com:mothership/ai-pipeline.git
git push -u origin main
```

---

## Agent Sessions (Run in Parallel)

Launch these 3 sessions simultaneously. Each agent works on a separate domain. They can be merged independently.

---

### SESSION A: Database + Task API + State Machine

**Branch:** `feat/core-api`

**Prompt for the agent:**

```
Read SPEC.md in the project root. Implement the core Tasks API (Phase 1 + Phase 2).

IMPORTANT: Read CLAUDE.md for coding conventions.

## What to build:

### 1. Prisma Schema (see SPEC.md section 3)
- `tasks` table with all columns from section 3.1
- `task_events` table (audit log) from section 3.2
- Create the initial migration

### 2. Tasks Module (NestJS)

File structure:
- src/tasks/tasks.module.ts
- src/tasks/tasks.controller.ts
- src/tasks/tasks.service.ts
- src/tasks/dto/create-task.dto.ts (validate: description required, repo optional, type optional)
- src/tasks/dto/clarify-task.dto.ts (validate: answers array required)
- src/tasks/dto/task-query.dto.ts (validate: page, limit, status filter, repo filter)

### 3. API Endpoints (see SPEC.md section 4.1)

- POST /api/tasks — Create task. Flow:
  1. Validate input
  2. Save task to DB with status "received"
  3. Log "created" event
  4. Call the LLM service (injected) to analyze
  5. Save LLM analysis to task record
  6. If clear_enough=true: call GitHub service (injected) to create issue, update status to "dispatched"
  7. If clear_enough=false: update status to "needs_clarification", return questions
  8. Return task with current status

- POST /api/tasks/:id/clarify — Submit answers. Flow:
  1. Load task, verify status is "needs_clarification"
  2. Save answers to DB
  3. Re-call LLM with original description + Q&A appended
  4. Create GitHub Issue
  5. Update status to "dispatched"

- GET /api/tasks — List tasks. Paginated. Filter by status, repo. Sort by created_at DESC.
- GET /api/tasks/:id — Task detail with all events from task_events table.
- POST /api/tasks/:id/retry — Retry a failed task (re-run LLM + GitHub issue creation).
- DELETE /api/tasks/:id — Cancel task (only if status is received/analyzing/needs_clarification).
- GET /api/health — Return { status: "ok", db: "connected" } (check DB connection).

### 4. Task State Machine (see SPEC.md section 5)

Valid transitions:
- received → analyzing
- analyzing → needs_clarification
- analyzing → dispatched
- needs_clarification → dispatched (after clarification)
- dispatched → coding (updated by GitHub webhook)
- coding → pr_open (updated by GitHub webhook)
- pr_open → merged
- pr_open → failed
- Any state → failed (on error)

Enforce transitions in the service — reject invalid state changes.

### 5. Event Logging

Every state change should create a task_event record:
- event_type: "created", "analyzing", "llm_response", "clarification_sent", "clarification_received", "dispatched", "pr_opened", "pr_merged", "failed"
- payload: relevant data (e.g., LLM response, issue URL, error message)

## Dependencies on other agents:

The LLM service and GitHub service will be built by Session B.
For now, create INTERFACES for them and inject them via NestJS dependency injection:

- LlmService.analyzeTask(task): Promise<LlmAnalysis>
- GitHubService.createIssue(task, analysis): Promise<{ issueNumber, issueUrl }>

Use mock implementations that return dummy data so your endpoints are testable standalone.

## Tests:

Write unit tests for:
- Task state machine transitions (valid and invalid)
- DTO validation
- Controller endpoints (mock the services)
```

---

### SESSION B: LLM + GitHub Integration Services

**Branch:** `feat/integrations`

**Prompt for the agent:**

```
Read SPEC.md in the project root. Implement the LLM and GitHub integration services.

IMPORTANT: Read CLAUDE.md for coding conventions.

## What to build:

### 1. LLM Module (src/llm/)

File structure:
- src/llm/llm.module.ts
- src/llm/llm.service.ts
- src/llm/prompts/default-system-prompt.ts

LlmService:
- analyzeTask(task: { title, description, acceptanceCriteria?, files?, type?, repo }): Promise<LlmAnalysis>
- Makes POST request to https://api.openai.com/v1/chat/completions
- Model: gpt-4o
- System prompt: see SPEC.md section 6.2
- User message: see SPEC.md section 6.3 (template with task fields)
- Parse response from choices[0].message.content as JSON
- Strip markdown code fences if present
- On parse failure: return fallback { clear_enough: false, task_type: "bug-fix", recommended_agent: "claude-code" }
- LlmAnalysis interface: see SPEC.md section 4.2

Per-repo system prompt (SPEC.md section 17):
- Before calling OpenAI, fetch the repo's .ai/prompts/system.md from GitHub
- Use GitHub API: GET /repos/{owner}/{repo}/contents/.ai/prompts/system.md
- If exists: use its content as system prompt instead of default
- If 404: use default system prompt
- Cache results in memory for 1 hour (simple Map with TTL)

### 2. GitHub Module (src/github/)

File structure:
- src/github/github.module.ts
- src/github/github-issues.service.ts
- src/github/github-webhook.controller.ts
- src/github/templates/issue-body.template.ts

GitHubIssuesService:
- createIssue(task, analysis): Promise<{ issueNumber, issueUrl, htmlUrl }>
- POST https://api.github.com/repos/{owner}/{repo}/issues
- Auth: Authorization: Bearer {GITHUB_TOKEN}
- Header: Accept: application/vnd.github+v3+json
- Issue body template: see SPEC.md section 7.3
- Labels: ["ai-task", analysis.task_type] + optional "codex" or "copilot-eligible"
- NO assignees (section 13, rule 5)
- SECURITY: Validate repo starts with "mothership/" before making the API call

Issue body template (src/github/templates/issue-body.template.ts):
- Export a function that takes (task, analysis, clarificationQA?) and returns the markdown string
- Include: Task summary, description, acceptance criteria, likely files, agent instructions, scope, Q&A if present
- See SPEC.md section 7.3 for exact format

GitHubWebhookController:
- POST /api/webhooks/github
- Verify X-Hub-Signature-256 with GITHUB_WEBHOOK_SECRET
- Handle events:
  - Pull request opened (by bot): find task by issue number → update status to "pr_open", save PR URL
  - Pull request merged: update task status to "merged"
  - Pull request closed (not merged): update task status to "failed"
  - Issue comment created (by bot): this is the agent asking a question — relay info (store in events for now, Slack relay in Session D)

### 3. Shared interfaces

Create src/common/interfaces/ with:
- llm-analysis.interface.ts (LlmAnalysis)
- task.interface.ts (shared Task type if needed)

These interfaces should match the Prisma types but be usable without Prisma dependency.

## Tests:

Write unit tests for:
- LLM response parsing (valid JSON, JSON with code fences, invalid JSON → fallback)
- Issue body template generation
- GitHub webhook signature verification
- Webhook event handling (PR opened, merged, closed)
- Per-repo prompt fetching (cache hit, cache miss, 404 fallback)
```

---

### SESSION C: Auth + Web UI

**Branch:** `feat/web-ui`

**Prompt for the agent:**

```
Read SPEC.md in the project root. Implement GitHub OAuth authentication and the Web UI.

IMPORTANT: Read CLAUDE.md for coding conventions.

## What to build:

### 1. Auth Module (src/auth/)

File structure:
- src/auth/auth.module.ts
- src/auth/auth.controller.ts (login, callback, logout routes)
- src/auth/auth.service.ts
- src/auth/github.strategy.ts (Passport GitHub strategy)
- src/auth/auth.guard.ts (protect routes)
- src/auth/session.serializer.ts

GitHub OAuth flow (SPEC.md section 16.1):
- GET /auth/github → redirect to GitHub OAuth
- GET /auth/github/callback → handle callback, verify org membership, create session
- GET /auth/logout → destroy session
- GET /auth/me → return current user info

On callback:
1. Get user profile from GitHub
2. Call GitHub API: GET /user/orgs to check if user belongs to "mothership"
3. If NOT in mothership org → reject with 403 "You must be a member of the mothership organization"
4. If in mothership org → create session, redirect to dashboard

Session:
- Use express-session with a signed cookie
- Store: user's GitHub username, avatar, email, org membership
- SESSION_SECRET from environment variable

Auth Guard:
- NestJS guard that checks for valid session
- Apply to all /api/* routes
- Exclude: /api/health, /api/webhooks/* (webhooks use signature verification instead)
- Exclude: /auth/* routes

### 2. Web UI (web/)

Create a React + Tailwind application in the /web directory.
Use Vite for the build tool.

Pages:

#### GET / — Dashboard
- Show task list in a table/card layout
- Columns: Status badge, Title (linked to detail), Repo, Agent, Task Type, Created At
- Status badges with colors: received (gray), analyzing (blue), needs_clarification (yellow), dispatched (purple), coding (indigo), pr_open (orange), merged (green), failed (red)
- Filter bar: status dropdown, repo dropdown
- Auto-refresh: poll GET /api/tasks every 30 seconds
- "New Task" button in top right

#### GET /tasks/new — New Task Form
- Fields:
  - Description (textarea, required)
  - Task Type (dropdown: auto-detect, bug-fix, feature, refactor, test-coverage)
  - Repository (dropdown of mothership/* repos, default: mothership/finance-service)
  - Files/Modules (text input, optional)
  - Acceptance Criteria (textarea, optional)
  - Priority (radio: normal, urgent)
- Submit button → POST /api/tasks
- If response.status = "needs_clarification": show questions inline with answer fields
- If response.status = "dispatched": redirect to task detail page

#### GET /tasks/:id — Task Detail
- Header: title, status badge, agent badge
- Timeline: list of events in chronological order with timestamps
- GitHub links: Issue URL, PR URL (if exists)
- If status = "needs_clarification":
  - Show questions with answer text fields
  - "Submit Answers" button → POST /api/tasks/:id/clarify
- Agent override: dropdown to change recommended agent (SPEC.md section 18.2)
  - Options: Claude Code, Codex, Copilot
  - Default: LLM recommendation (highlighted)
  - Only editable before dispatch
- If status = "failed": show "Retry" button

### 3. Serve the frontend

Configure NestJS to serve the built React app from the /web/dist directory in production.
In development, run Vite dev server separately.

Add a NestJS static module:
```typescript
ServeStaticModule.forRoot({
  rootPath: join(__dirname, '..', 'web', 'dist'),
  exclude: ['/api*', '/auth*'],
})
```

## Dependencies:

```bash
# In /web directory:
pnpm create vite . --template react-ts
pnpm add tailwindcss @tailwindcss/vite
```

## Tests:

- Auth guard: test that unauthenticated requests are rejected
- Org membership check: test that non-mothership users are rejected
- UI: basic component render tests with Vitest
```

---

## After Parallel Sessions Complete

### MERGE ORDER

1. Merge Session A (`feat/core-api`) first — it has the database schema and core module
2. Merge Session B (`feat/integrations`) — replace mock services with real implementations
3. Merge Session C (`feat/web-ui`) — adds auth and frontend

### INTEGRATION FIXES

After merging all three, there may be import path conflicts or interface mismatches. Run a quick session:

```
Read the codebase. All three feature branches have been merged.
Fix any import errors, interface mismatches, or missing wiring between modules.
Make sure:
1. TasksModule imports LlmModule and GitHubModule
2. TasksService injects the real LlmService and GitHubIssuesService (not mocks)
3. AuthGuard is applied globally to /api/* routes
4. All environment variables are loaded via @nestjs/config
5. Run: pnpm build — fix any TypeScript errors
6. Run: pnpm test — fix any failing tests
```

---

## Session D: Slack Integration (After Merge)

**Branch:** `feat/slack`

**Prompt for the agent:**

```
Read SPEC.md in the project root. Implement Slack integration (section 8).

IMPORTANT: Read CLAUDE.md for coding conventions.

## What to build:

### 1. Slack Module (src/slack/)

File structure:
- src/slack/slack.module.ts
- src/slack/slack.service.ts
- src/slack/slack-webhook.controller.ts

SlackService:
- sendDM(slackUserId, text): Promise<void> — Send a DM using chat.postMessage
- sendThreadReply(channel, threadTs, text): Promise<void> — Reply in a thread
- sendTaskNotification(task, event): Promise<void> — Format and send status notifications

SlackWebhookController:
- POST /api/webhooks/slack
- Verify X-Slack-Signature with SLACK_SIGNING_SECRET
- Handle slash command: /ai-task <description>
  1. Parse the description from the text field
  2. Create task via TasksService
  3. Respond with acknowledgment (200 within 3 seconds — Slack requirement)
  4. If needs clarification: send questions as a DM thread
  5. If dispatched: send confirmation with issue URL
- Handle event callback: message.im (DM thread replies)
  1. Match thread_ts to a task's slack_thread_ts
  2. Extract answer text
  3. Call TasksService.clarify()

### 2. Notifications

Wire up notifications in TasksService or via NestJS events:
- When task dispatched: Slack DM "Task dispatched to {agent}. Issue: {url}"
- When PR opened (from GitHub webhook): Slack DM "PR ready for review: {pr_url}"
- When PR merged: Slack DM "Done! {pr_url} has been merged."
- When PR closed: Slack DM "PR needs attention: {pr_url}"
- When agent asks question (issue comment): Slack DM "The agent has a question: {question}"

### 3. Slack identity mapping

- When a user submits via Slack, store their slack_user_id on the task
- For notifications, use the task's slack_user_id
- For web-submitted tasks, use SLACK_DEFAULT_USER_ID as fallback

## Tests:

- Slack signature verification
- Slash command parsing
- Thread reply matching to task
- Notification message formatting
```

---

## Session E: Deployment (After All Features Merged)

**Prompt for the agent:**

```
Read SPEC.md section 15. Prepare the project for Railway deployment.

## What to build:

### 1. Dockerfile

Multi-stage build:
- Stage 1: Install dependencies + build NestJS + build React frontend
- Stage 2: Production image with only built artifacts
- Expose PORT from environment variable

### 2. railway.toml

See SPEC.md section 15 for the config.

### 3. docker-compose.yml (local development)

- App service: builds from Dockerfile, mounts source code, hot reload
- PostgreSQL service: postgres:16, with volume for data persistence
- Environment: load from .env

### 4. Package.json scripts

Add/update:
- "build": builds both NestJS and React frontend
- "start:prod": runs the built NestJS app
- "db:migrate": runs prisma migrate deploy
- "db:generate": runs prisma generate
- "db:seed": optional seed script

### 5. Railway deploy command

In railway.toml or Railway dashboard:
- Build command: pnpm install && pnpm build && npx prisma migrate deploy
- Start command: node dist/main.js

### 6. Health check

Ensure GET /api/health returns 200 and checks DB connectivity.
Railway uses this for readiness checks.
```

---

## Final Checklist

After all sessions complete and everything is deployed:

- [ ] Can sign in with GitHub OAuth (must be mothership org member)
- [ ] Can submit a task via Web UI → see it analyzed → GitHub Issue created
- [ ] Can submit a task via curl → get JSON response with issue URL
- [ ] Clarification flow works: unclear task → questions shown → answers submitted → issue created
- [ ] Agent override: can change agent before dispatch
- [ ] GitHub webhook: PR events update task status in dashboard
- [ ] Slack: /ai-task command creates a task
- [ ] Slack: notifications sent on dispatch, PR open, PR merge
- [ ] Auto-refresh: dashboard updates every 30s
- [ ] Failed tasks can be retried
- [ ] Non-mothership users are rejected at login
- [ ] Per-repo system prompt: repos with .ai/prompts/system.md get custom analysis
