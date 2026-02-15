# MULTI-REPO DASHBOARD Feature Specification

**Version:** 1.0
**Status:** Ready for Implementation
**Priority:** High
**Affects:** Web UI, Backend API, Database Schema, GitHub Integration
**Branch:** `feat/multi-repo-dashboard`

---

## Table of Contents

1. [Overview](#overview)
2. [User Stories](#user-stories)
3. [Repo Management](#repo-management)
4. [Dashboard Views](#dashboard-views)
5. [Repo Selector UI](#repo-selector-ui)
6. [Repo-Specific Features](#repo-specific-features)
7. [Database Changes](#database-changes)
8. [GitHub Integration](#github-integration)
9. [API Endpoints](#api-endpoints)
10. [Frontend Changes](#frontend-changes)
11. [Default Repo Preferences](#default-repo-preferences)
12. [Implementation Tasks](#implementation-tasks)
13. [Estimated Complexity](#estimated-complexity)

---

## 1. Overview

### Problem Statement

Currently, the AI Pipeline dashboard displays tasks from a single hardcoded default repository (`mothership/finance-service`). Users who work across multiple repos in the Mothership organization must:

- Context-switch between multiple browser tabs/instances
- Manually track tasks across different repos
- Cannot see unified metrics or compare task performance across repos
- Lose visibility when working on multiple services simultaneously

### Solution

The Multi-Repo Dashboard enables users to:

- View and manage tasks across all repos they have access to in the Mothership organization
- Switch between repo contexts seamlessly without losing state
- See unified analytics (total tasks, success rates, health indicators)
- Compare performance metrics across repos
- Configure repo-specific settings (default agents, prompt templates)
- Remember their last selected repo for quick context resumption

### Key Benefits

- **Unified visibility** — See all tasks in one place or filter by repo
- **Faster context switching** — No need for multiple tabs
- **Better analytics** — Cross-repo metrics and trends
- **Flexible routing** — Per-repo agent configuration
- **Improved UX** — Remember user preferences across sessions

---

## 2. User Stories

### Story 1: View All Tasks Across Repos
**As a** developer working on multiple Mothership microservices
**I want to** see all my AI tasks across repositories in one unified view
**So that** I can manage and track progress without switching between tabs

**Acceptance Criteria:**
- Dashboard displays tasks from all repos the user has access to
- Each task displays its repo name clearly
- Total task count shown (filtered by status if applicable)
- Can sort by repo, status, date, or priority

### Story 2: Filter Tasks by Repository
**As a** developer
**I want to** view only tasks for a specific repository
**So that** I can focus on work for one service at a time

**Acceptance Criteria:**
- Repo selector dropdown/tabs available in the dashboard header
- Selecting a repo filters all displayed tasks and metrics
- Selection persists across page navigation (session state)
- "All Repos" option shows combined view
- Last selected repo is remembered for next session

### Story 3: Compare Repo Performance
**As a** team lead
**I want to** compare task success rates, completion times, and failure rates across repos
**So that** I can identify which services need improvement

**Acceptance Criteria:**
- Comparison view shows key metrics per repo
- Metrics include: total tasks, completed, failed, success rate, avg completion time
- Visual indicators (charts, badges) for repo health
- Can filter by date range
- Exportable as CSV or JSON

### Story 4: Add and Manage Repo Access
**As a** user
**I want to** add new repos to my dashboard and remove old ones
**So that** I can customize my workspace

**Acceptance Criteria:**
- "Add Repo" button fetches list from GitHub
- Validates that user has access to the repo (GitHub API check)
- Displays only `mothership/*` repos
- Can remove repos from dashboard
- Removed repos don't lose their task history

### Story 5: Configure Per-Repo Settings
**As a** team lead
**I want to** set default agents and prompt templates per repository
**So that** tasks are dispatched to the right teams automatically

**Acceptance Criteria:**
- Repo settings page accessible from repo selector
- Can set default agent: Claude Code, Codex, Copilot
- Can upload custom system prompt (`.ai/prompts/system.md`)
- Settings displayed in task creation form when that repo is selected
- Can revert to default system prompt
- Settings stored per repo

### Story 6: See Repo Health Indicators
**As a** tech lead
**I want to** see at a glance which repos are healthy (low failure rate, fast completion)
**So that** I can allocate resources effectively

**Acceptance Criteria:**
- Health indicators shown in repo selector (colored badges)
- Color coding: green (>80% success), yellow (60-80%), red (<60%)
- Hover tooltip shows: last 7 days metrics
- Can click to drill down into failure details
- Automatically updates every 30 seconds

---

## 3. Repo Management

### 3.1 Add Repository

#### User Flow

1. User clicks "Add Repo" in the repo selector or settings page
2. Modal opens showing list of GitHub repos user has access to
3. User selects a repo (or types to search)
4. App validates:
   - Repo starts with `mothership/`
   - User has `push` access (via GitHub API: `GET /repos/{owner}/{repo}`)
   - Repo has at least one valid GitHub issue (optional, soft check)
5. Repo added to user's dashboard
6. User can now create tasks targeting that repo

#### API Validation

```
GET /api/users/me/available-repos
- Fetches list of mothership/* repos user has access to
- Returns: { repos: [{ name, fullName, url, description, isPrivate }] }
```

```
POST /api/users/me/repos
- Adds a repo to the user's dashboard
- Validates repo access via GitHub API
- Returns: { repo, createdAt }
- Errors: 404 repo not found, 403 user lacks access, 400 invalid repo name
```

### 3.2 Remove Repository

#### User Flow

1. User clicks "Remove" in repo selector context menu or settings
2. Confirmation dialog: "Are you sure? This doesn't delete GitHub data, just your dashboard view."
3. Confirm → repo removed from user's dashboard
4. Tasks from that repo remain in history (just not displayed unless re-added)

#### API

```
DELETE /api/users/me/repos/:repoId
- Removes repo from user's dashboard
- Does NOT delete task records
- Returns: { success: true }
```

### 3.3 Repo Access Validation

#### GitHub Permissions Check

Before allowing a user to interact with a repo:

1. User must be authenticated via GitHub OAuth
2. App calls: `GET /api/user/repos` (GitHub API) to list accessible repos
3. App filters for `mothership/*` repos only
4. For each repo user selects, verify:
   - Repo is in the filtered list
   - User has at least `push` permissions (collaborator)
5. Store user-repo association in database

#### Implementation

```typescript
// In github-oauth service
async getUserAccessibleRepos(): Promise<GithubRepo[]> {
  const repos = await this.octokit.repos.listForAuthenticatedUser();
  return repos.data
    .filter(r => r.full_name.startsWith('mothership/') && !r.archived)
    .map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      url: r.html_url,
      description: r.description,
      isPrivate: r.private,
      permissions: r.permissions, // { admin, maintain, push, triage, pull }
    }));
}

// Validation before task creation
async validateRepoAccess(userId: string, repoName: string): Promise<boolean> {
  const userRepos = await this.getUserAccessibleRepos();
  const repo = userRepos.find(r => r.fullName === repoName);
  if (!repo || !repo.permissions.push) {
    throw new ForbiddenException(`No access to ${repoName}`);
  }
  return true;
}
```

---

## 4. Dashboard Views

### 4.1 All Repos Combined View

**URL:** `/dashboard` (default, no repo filter)
**Show:** All tasks across all repos user has added

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  AI Pipeline Dashboard                              │
│  ┌──────────┐  ┌──────────────────────────────────┐ │
│  │ Repos:   │  │ All Repos  [dropdown] + Settings │ │
│  │ [All ▼]  │  └──────────────────────────────────┘ │
│  └──────────┘  ┌──────────────────────────────────┐ │
│                │ Total: 45 tasks                   │ │
│                │ Completed: 32 (71%) | Failed: 5  │ │
│                │ In Progress: 8                    │ │
│                └──────────────────────────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Task List (Sorted: Newest)                      │ │
│  │                                                 │ │
│  │ [finance-service] Fix payment webhook (pr_open) │ │
│  │ [user-service] Add OAuth2 support (coding)      │ │
│  │ [notifications] Email template refactor (merged)│ │
│  │ ... (paginated)                                 │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Metrics shown:**
- Total task count (all statuses)
- Tasks by status (received, analyzing, needs_clarification, dispatched, coding, pr_open, merged, failed)
- Success rate: `(merged / (merged + failed)) * 100`
- Average completion time (dispatched → merged)

### 4.2 Per-Repo Filtered View

**URL:** `/dashboard?repo=mothership/finance-service`
**Show:** Only tasks for that repo

**Layout:** Same as above, but filtered

**Metrics shown:**
- Total tasks for repo
- Per-status breakdown
- Success rate (repo-specific)
- Average completion time (repo-specific)
- Most recently modified tasks for that repo

### 4.3 Repo Comparison View

**URL:** `/dashboard/compare`
**Show:** Side-by-side metrics for all repos

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Repo Comparison Dashboard                                      │
│  Date Range: [Last 7 Days ▼]  Export CSV | Export JSON         │
│  ┌──────────────────────────────────────────────────────────────┐
│  │ Repo                │ Tasks │ Success │ Failed │ Avg Time    │
│  ├──────────────────────────────────────────────────────────────┤
│  │ finance-service    │  28   │  82%    │ 5      │ 2.5h        │
│  │ user-service       │  12   │  67%    │ 4      │ 3.1h        │
│  │ notifications      │  5    │  100%   │ 0      │ 1.8h        │
│  │ auth-service       │  0    │ N/A     │ N/A    │ N/A         │
│  └──────────────────────────────────────────────────────────────┘
│                                                                 │
│  Charts:                                                        │
│  [Line chart: Tasks completed over time by repo]               │
│  [Bar chart: Success rate by repo]                             │
└─────────────────────────────────────────────────────────────────┘
```

**Metrics shown:**
- Repo name
- Total tasks (last 7 days)
- Success rate (%)
- Failed count
- Average time to completion
- Color-coded health badges
- Last updated timestamp

---

## 5. Repo Selector UI

### 5.1 Dropdown-based Selector (Primary)

**Location:** Dashboard header, left side
**Trigger:** Clicking "Repos" or repo name dropdown

**UI:**
```
┌─────────────────────┐
│ Repos: [All Repos ▼]│  ← clickable dropdown
└─────────────────────┘

When clicked, shows:

┌────────────────────────────────────────┐
│ ◌ All Repos               (45 tasks)    │  ← with health badge
│ ◌ finance-service        (28 tasks) 🟢 │
│ ◌ user-service           (12 tasks) 🟡 │
│ ◌ notifications           (5 tasks) 🟢 │
│ ─────────────────────────────────────── │
│ ⚙️ Manage Repos                         │  ← opens settings modal
│ ➕ Add Repo                             │  ← opens add repo modal
└────────────────────────────────────────┘
```

**States:**
- Current selection highlighted with checkmark
- Health indicator (🟢 green, 🟡 yellow, 🔴 red) next to each repo
- Task count shown (for quick reference)
- "Manage Repos" and "Add Repo" at bottom

### 5.2 Tab-based Selector (Alternative)

**Location:** Dashboard header, horizontal tabs
**Display:** [All Repos] [finance-service] [user-service] [notifications] ... [+]

**States:**
- Active tab has underline/highlight
- Hover shows health indicator tooltip
- "+" tab opens add repo modal
- Overflow handled with scrollable tabs or "More Repos" menu

### 5.3 Sidebar Selector (Desktop Alternative)

**Location:** Left sidebar, persistent
**Display:** Vertical list of repos with health indicators

```
┌─────────────────────┐
│ Repositories        │
│                     │
│ ◌ All Repos (45)    │
│   ├─ 🟢 finance-s   │ ← hover: finance-service
│   ├─ 🟡 user-serv   │
│   ├─ 🟢 notif...    │
│   └─ 🔴 auth-serv   │
│                     │
│ [⚙️] [➕]           │
└─────────────────────┘
```

### 5.4 Repo Settings Modal

**Trigger:** Clicking "⚙️ Manage Repos" or "Settings" in dropdown

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  Repo Settings                              [✕]   │
│                                                    │
│  Select a repo:                                    │
│  [finance-service ▼]                               │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Default Agent: [Claude Code ▼]               │ │
│  │                                              │ │
│  │ Custom System Prompt:                        │ │
│  │ [Upload .ai/prompts/system.md]               │ │
│  │ [Use default prompt]                         │ │
│  │                                              │ │
│  │ Health Metrics (last 7 days):               │ │
│  │ Success Rate: 82%                            │ │
│  │ Avg Completion: 2.5h                         │ │
│  │ Total Tasks: 28                              │ │
│  │                                              │ │
│  │ [Remove Repo] [Save] [Cancel]                │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Settings available:**
- Default agent for repo (auto-selects when creating tasks)
- Custom system prompt upload (stored in DB, fetched when analyzing tasks)
- View repo health metrics
- Remove repo from dashboard

### 5.5 Add Repo Modal

**Trigger:** Clicking "➕ Add Repo"

**Layout:**
```
┌────────────────────────────────────────────────────┐
│  Add Repository                             [✕]   │
│                                                    │
│  Search repos: [__________________________]        │
│                                                    │
│  Available repositories:                          │
│  ☐ mothership/finance-service (accessible)       │
│  ☐ mothership/user-service (accessible)          │
│  ☐ mothership/notifications (accessible)         │
│  ☐ mothership/auth-service (no push access) ⚠️   │
│  ... (paginated)                                  │
│                                                    │
│  [Add Selected] [Cancel]                          │
│  (shows count: "3 repos selected")                │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Features:**
- Search by repo name
- Shows access level (checkmark for accessible, warning for no access)
- Batch-add multiple repos
- Indicates why repo is unavailable (archived, no access, etc.)

---

## 6. Repo-Specific Features

### 6.1 Per-Repo Task Counts

**Display locations:**
- Repo selector (dropdown, tabs, sidebar)
- Dashboard summary card
- Comparison view table

**Breakdown by status:**
```
[Repo Name]
├─ Received: 2
├─ Analyzing: 1
├─ Needs Clarification: 0
├─ Dispatched: 3
├─ Coding: 2
├─ PR Open: 4
├─ Merged: 24
└─ Failed: 5
Total: 41 tasks
```

**API Endpoint:**
```
GET /api/repos/:repoId/stats
Returns: {
  repo: "mothership/finance-service",
  totalTasks: 41,
  statusBreakdown: {
    received: 2,
    analyzing: 1,
    needsClarification: 0,
    dispatched: 3,
    coding: 2,
    prOpen: 4,
    merged: 24,
    failed: 5
  },
  updated_at: "2026-02-15T10:00:00Z"
}
```

### 6.2 Per-Repo Success Rates

**Calculation:**
```
successRate = (merged / (merged + failed)) * 100
```

**Display:**
- Percentage badge in repo selector
- Trend line (last 7, 30 days)
- Per-day breakdown in comparison view

**Edge cases:**
- No completed tasks yet: show "-" or "N/A"
- Only merged, no failed: show "100%"
- Only failed, no merged: show "0%"

**API Endpoint:**
```
GET /api/repos/:repoId/health?days=7
Returns: {
  repo: "mothership/finance-service",
  period: "7d",
  successRate: 82.76,
  tasksCompleted: 24,
  tasksFailed: 5,
  tasksInProgress: 6,
  avgCompletionTimeHours: 2.5,
  failureReasons: [
    { reason: "Github API rate limit", count: 2 },
    { reason: "Merge conflict", count: 3 }
  ],
  trend: [
    { date: "2026-02-08", successRate: 80 },
    { date: "2026-02-09", successRate: 83 },
    ...
  ]
}
```

### 6.3 Repo Health Indicators

**Health Status Badges:**
- 🟢 **Green (Healthy):** Success rate ≥ 80%, no recent failures
- 🟡 **Yellow (At Risk):** Success rate 60-79%, some recent failures
- 🔴 **Red (Critical):** Success rate < 60%, multiple recent failures
- ⚪ **Gray:** No completed tasks yet

**Hover Tooltip:**
```
finance-service
━━━━━━━━━━━━━━━━━
Success: 82.76%
Completed: 24 tasks
Failed: 5 tasks
Avg Time: 2.5h
Last 7 days
```

**Click Behavior:**
- Click to drill down into failure reasons
- Show which agents failed most often
- Show which task types have lowest success rates

**Update Frequency:**
- Auto-refresh every 30 seconds (via polling or WebSocket)
- Manual refresh button in dashboard

---

## 7. Database Changes

### 7.1 New Collections/Schema

#### `user-repos` (User-Repo Association)

**Purpose:** Track which repos each user has added to their dashboard

```typescript
@Schema({ timestamps: true, collection: 'user-repos' })
export class UserRepo {
  @Prop({ required: true, index: true })
  userId: string; // User's GitHub username or email

  @Prop({ required: true, index: true })
  repoName: string; // e.g., "mothership/finance-service"

  @Prop()
  repoFullName?: string; // GitHub full_name (may differ from repoName)

  @Prop()
  defaultAgent?: string; // 'claude-code' | 'codex' | 'copilot'

  @Prop()
  customSystemPrompt?: string; // Custom .ai/prompts/system.md content

  @Prop({ default: false })
  isActive: boolean; // Soft delete — false means removed from dashboard

  @Prop()
  addedAt: Date;

  @Prop()
  removedAt?: Date;

  // Cached metadata
  @Prop()
  repoDescription?: string;

  @Prop()
  repoUrl?: string;

  @Prop({ default: false })
  isPrivate: boolean;

  // For quick lookups
  createdAt?: Date;
  updatedAt?: Date;
}

// Indexes
UserRepoSchema.index({ userId: 1, isActive: 1 }); // Find user's active repos
UserRepoSchema.index({ repoName: 1 }); // Find a specific repo
UserRepoSchema.index({ userId: 1, repoName: 1 }, { unique: true }); // Prevent duplicates
```

#### `repo-stats` (Denormalized Health Metrics)

**Purpose:** Cache repo health stats for fast dashboard queries (updated periodically)

```typescript
@Schema({ timestamps: true, collection: 'repo-stats' })
export class RepoStats {
  @Prop({ required: true, index: true })
  repoName: string;

  @Prop({ required: true, enum: ['7d', '30d', 'all'] })
  period: string;

  @Prop({ default: 0 })
  totalTasks: number;

  @Prop({ default: 0 })
  tasksCompleted: number;

  @Prop({ default: 0 })
  tasksFailed: number;

  @Prop({ default: 0 })
  tasksInProgress: number;

  @Prop({ type: Number, default: 0 })
  successRate: number; // Percentage (0-100)

  @Prop({ type: Number, default: 0 })
  avgCompletionTimeHours: number;

  @Prop({ type: Object, default: {} })
  statusBreakdown: {
    received: number;
    analyzing: number;
    needsClarification: number;
    dispatched: number;
    coding: number;
    prOpen: number;
    merged: number;
    failed: number;
  };

  @Prop({ type: [Object], default: [] })
  failureReasons: Array<{
    reason: string;
    count: number;
  }>;

  @Prop({ type: [Object], default: [] })
  trend: Array<{
    date: string; // ISO date
    successRate: number;
    tasksCompleted: number;
  }>;

  @Prop()
  lastCalculatedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

// Indexes
RepoStatsSchema.index({ repoName: 1, period: 1 }); // Find stats for repo/period
RepoStatsSchema.index({ lastCalculatedAt: -1 }); // Find stale stats for update
```

### 7.2 Task Schema Updates

**Add to existing Task schema:**

```typescript
@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  // ... existing fields ...

  @Prop({ index: true })
  repoId?: string; // Reference to user-repos._id (optional, for quick lookups)

  // ... rest of fields ...
}

// Add index for repo-filtered queries
TaskSchema.index({ repo: 1, createdAt: -1 }); // Improve dashboard filtering
```

### 7.3 User Schema Updates

**Add to User schema (if not present):**

```typescript
@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string; // GitHub username

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  githubId: number;

  // Preferences
  @Prop({ default: 'mothership/finance-service' })
  lastSelectedRepo: string; // Remember last repo

  @Prop({ type: [String], default: [] })
  activeRepos: string[]; // List of repos user has added (denormalized for fast lookup)

  @Prop({ default: true })
  dashboardShowHealthBadges: boolean;

  @Prop({ default: true })
  dashboardAutoRefresh: boolean;

  @Prop({ default: 30 })
  dashboardAutoRefreshIntervalSeconds: number;

  createdAt?: Date;
  updatedAt?: Date;
}
```

---

## 8. GitHub Integration

### 8.1 Fetch User's Accessible Repos

**When:** User opens "Add Repo" modal
**What:** Fetch list of `mothership/*` repos user has access to

**Implementation:**

```typescript
// github.service.ts

async getUserAccessibleRepos(githubUsername: string): Promise<GithubRepo[]> {
  try {
    // Get all repos the authenticated user can access
    const repos = await this.octokit.repos.listForAuthenticatedUser({
      visibility: 'all',
      per_page: 100,
    });

    // Filter for mothership/* and active repos
    const mothershipsRepos = repos.data
      .filter(r => {
        return (
          r.full_name.startsWith('mothership/') &&
          !r.archived &&
          r.permissions.push // User must have push access
        );
      })
      .map(r => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        url: r.html_url,
        description: r.description || '',
        isPrivate: r.private,
        hasAccess: true,
      }));

    return mothershipsRepos;
  } catch (error) {
    if (error.status === 401) {
      throw new UnauthorizedException('GitHub token expired');
    }
    throw error;
  }
}

// Also handle paginated results if > 100 repos
```

**Cache Strategy:**
- Cache result for 30 minutes per user
- Invalidate cache when user adds/removes repos
- Allow manual refresh via UI

### 8.2 Validate Repo Access Before Task Creation

**When:** User submits task for a repo
**What:** Verify user has access to the repo

**Implementation:**

```typescript
// In tasks.service.ts

async validateUserRepoAccess(userId: string, repoName: string): Promise<void> {
  // Check if repo is in user's active repos list
  const userRepo = await this.userRepoModel.findOne({
    userId,
    repoName,
    isActive: true,
  }).exec();

  if (!userRepo) {
    throw new ForbiddenException(
      `No access to ${repoName}. Add it first via dashboard.`
    );
  }

  // Soft validation: check GitHub API (optional, can be async job)
  try {
    const repo = await this.githubService.getRepo(repoName);
    if (!repo || repo.archived) {
      throw new BadRequestException(`Repository ${repoName} is archived or not found`);
    }
  } catch (error) {
    // Log but don't fail — repo might have limited API quota
    this.logger.warn(`Could not validate GitHub access: ${error.message}`);
  }
}
```

### 8.3 Fetch Repo-specific System Prompt

**When:** Task is being analyzed
**What:** Check if repo has custom `.ai/prompts/system.md`

**Implementation:**

```typescript
// In llm.service.ts

async getRepoSystemPrompt(repoName: string): Promise<string | null> {
  try {
    const cacheKey = `repo-prompt:${repoName}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    const content = await this.githubService.getFileContent(
      repoName,
      '.ai/prompts/system.md'
    );

    if (content) {
      // Cache for 1 hour
      await this.cacheService.set(cacheKey, content, 3600);
      return content;
    }

    return null; // No custom prompt, use default
  } catch (error) {
    if (error.status === 404) {
      return null; // File doesn't exist
    }
    throw error; // Other errors (rate limit, auth) are real problems
  }
}

// In tasks.service.ts

async analyzeTask(createTaskDto: CreateTaskDto) {
  // ...

  // Try to get repo-specific prompt first
  let systemPrompt = await this.llmService.getRepoSystemPrompt(repo);

  // Fall back to user-configured or default
  if (!systemPrompt) {
    const userRepo = await this.userRepoModel.findOne({ repoName: repo });
    systemPrompt = userRepo?.customSystemPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  const analysis = await this.llmService.analyzeTask(
    createTaskDto.description,
    systemPrompt,
    createTaskDto
  );

  // ...
}
```

**Cache Strategy:**
- Cache per-repo prompt for 1 hour
- Allow manual refresh if user re-uploads prompt
- Invalidate cache when user updates repo settings

---

## 9. API Endpoints

### 9.1 Repo Management Endpoints

#### `GET /api/users/me/repos` — Get User's Added Repos

**Request:**
```
GET /api/users/me/repos?includeStats=true&sort=lastUsed
```

**Response (200):**
```json
{
  "repos": [
    {
      "id": "repo-123",
      "userId": "krishna",
      "repoName": "mothership/finance-service",
      "repoFullName": "mothership/finance-service",
      "repoUrl": "https://github.com/mothership/finance-service",
      "repoDescription": "Payment processing service",
      "defaultAgent": "claude-code",
      "customSystemPrompt": null,
      "isActive": true,
      "addedAt": "2026-02-01T10:00:00Z",
      "stats": {
        "totalTasks": 28,
        "successRate": 82.76,
        "health": "green",
        "lastTaskAt": "2026-02-15T15:30:00Z"
      }
    },
    {
      "id": "repo-456",
      "userId": "krishna",
      "repoName": "mothership/user-service",
      "repoFullName": "mothership/user-service",
      "repoUrl": "https://github.com/mothership/user-service",
      "repoDescription": "User authentication & profiles",
      "defaultAgent": "claude-code",
      "customSystemPrompt": null,
      "isActive": true,
      "addedAt": "2026-02-05T10:00:00Z",
      "stats": {
        "totalTasks": 12,
        "successRate": 66.67,
        "health": "yellow",
        "lastTaskAt": "2026-02-14T09:15:00Z"
      }
    }
  ],
  "total": 2
}
```

**Errors:**
- 401: Unauthorized (not logged in)
- 500: Database error

---

#### `GET /api/users/me/available-repos` — List Accessible GitHub Repos

**Request:**
```
GET /api/users/me/available-repos?search=finance
```

**Response (200):**
```json
{
  "repos": [
    {
      "id": 12345,
      "name": "finance-service",
      "fullName": "mothership/finance-service",
      "url": "https://github.com/mothership/finance-service",
      "description": "Payment processing service",
      "isPrivate": false,
      "hasAccess": true,
      "isAdded": true
    },
    {
      "id": 12346,
      "name": "finance-integration",
      "fullName": "mothership/finance-integration",
      "url": "https://github.com/mothership/finance-integration",
      "description": "External integrations (Stripe, NetSuite)",
      "isPrivate": false,
      "hasAccess": true,
      "isAdded": false
    }
  ],
  "total": 2,
  "cached": true,
  "cacheExpiresAt": "2026-02-15T11:30:00Z"
}
```

**Errors:**
- 401: Unauthorized
- 403: GitHub OAuth token expired
- 500: GitHub API error

---

#### `POST /api/users/me/repos` — Add Repo to Dashboard

**Request:**
```json
{
  "repoName": "mothership/user-service",
  "defaultAgent": "claude-code"
}
```

**Response (201):**
```json
{
  "id": "repo-456",
  "userId": "krishna",
  "repoName": "mothership/user-service",
  "repoFullName": "mothership/user-service",
  "defaultAgent": "claude-code",
  "isActive": true,
  "addedAt": "2026-02-15T16:00:00Z"
}
```

**Errors:**
- 400: Invalid repo name (not mothership/*)
- 403: User lacks access to repo
- 404: Repo not found on GitHub
- 409: Repo already added (idempotent: return 200 instead)

---

#### `DELETE /api/users/me/repos/:repoId` — Remove Repo

**Request:**
```
DELETE /api/users/me/repos/repo-456
```

**Response (200):**
```json
{
  "success": true,
  "repoName": "mothership/user-service",
  "tasksKept": 12,
  "message": "Repo removed from dashboard. Task history preserved."
}
```

**Errors:**
- 404: Repo not found
- 500: Database error

---

### 9.2 Repo Settings Endpoints

#### `GET /api/repos/:repoId/settings` — Get Repo Settings

**Request:**
```
GET /api/repos/repo-456/settings
```

**Response (200):**
```json
{
  "id": "repo-456",
  "repoName": "mothership/user-service",
  "defaultAgent": "claude-code",
  "customSystemPrompt": "You are...",
  "customSystemPromptUploadedAt": "2026-02-10T14:30:00Z",
  "useCustomPrompt": true
}
```

---

#### `PATCH /api/repos/:repoId/settings` — Update Repo Settings

**Request:**
```json
{
  "defaultAgent": "codex",
  "useCustomPrompt": false
}
```

**Response (200):**
```json
{
  "id": "repo-456",
  "repoName": "mothership/user-service",
  "defaultAgent": "codex",
  "useCustomPrompt": false,
  "updatedAt": "2026-02-15T16:05:00Z"
}
```

---

#### `POST /api/repos/:repoId/upload-prompt` — Upload Custom System Prompt

**Request:** (multipart/form-data)
```
POST /api/repos/repo-456/upload-prompt
Content-Type: multipart/form-data

file: <.ai/prompts/system.md content>
```

**Response (200):**
```json
{
  "id": "repo-456",
  "repoName": "mothership/user-service",
  "customSystemPromptUploadedAt": "2026-02-15T16:06:00Z",
  "message": "Custom prompt uploaded successfully"
}
```

**Errors:**
- 413: File too large (max 50KB)
- 400: Invalid file format

---

### 9.3 Repo Stats & Health Endpoints

#### `GET /api/repos/:repoId/stats` — Get Repo Task Stats

**Request:**
```
GET /api/repos/repo-456/stats?period=7d
```

**Response (200):**
```json
{
  "repoName": "mothership/user-service",
  "period": "7d",
  "totalTasks": 12,
  "statusBreakdown": {
    "received": 0,
    "analyzing": 0,
    "needsClarification": 0,
    "dispatched": 0,
    "coding": 1,
    "prOpen": 2,
    "merged": 8,
    "failed": 1
  },
  "updatedAt": "2026-02-15T16:00:00Z"
}
```

---

#### `GET /api/repos/:repoId/health` — Get Repo Health Metrics

**Request:**
```
GET /api/repos/repo-456/health?days=7
```

**Response (200):**
```json
{
  "repoName": "mothership/user-service",
  "period": "7d",
  "healthStatus": "yellow",
  "successRate": 66.67,
  "tasksCompleted": 8,
  "tasksFailed": 4,
  "tasksInProgress": 1,
  "avgCompletionTimeHours": 3.1,
  "failureReasons": [
    {
      "reason": "Merge conflict",
      "count": 2
    },
    {
      "reason": "Test failure",
      "count": 2
    }
  ],
  "trend": [
    { "date": "2026-02-08", "successRate": 75 },
    { "date": "2026-02-09", "successRate": 70 },
    { "date": "2026-02-10", "successRate": 67 },
    { "date": "2026-02-11", "successRate": 67 },
    { "date": "2026-02-12", "successRate": 67 },
    { "date": "2026-02-13", "successRate": 67 },
    { "date": "2026-02-14", "successRate": 67 }
  ],
  "calculatedAt": "2026-02-15T16:00:00Z"
}
```

---

#### `GET /api/repos/compare/health` — Compare Health Across Repos

**Request:**
```
GET /api/repos/compare/health?period=7d&userRepos=true
```

**Response (200):**
```json
{
  "period": "7d",
  "repos": [
    {
      "repoName": "mothership/finance-service",
      "totalTasks": 28,
      "successRate": 82.76,
      "tasksCompleted": 23,
      "tasksFailed": 5,
      "avgCompletionTimeHours": 2.5,
      "health": "green"
    },
    {
      "repoName": "mothership/user-service",
      "totalTasks": 12,
      "successRate": 66.67,
      "tasksCompleted": 8,
      "tasksFailed": 4,
      "avgCompletionTimeHours": 3.1,
      "health": "yellow"
    }
  ],
  "calculatedAt": "2026-02-15T16:00:00Z"
}
```

---

### 9.4 Updated Existing Endpoints

#### `GET /api/tasks?repo=finance-service` — Filter Tasks by Repo

**Updated Query Parameters:**
```
GET /api/tasks?repo=mothership/finance-service&status=merged&page=1&limit=20
```

**Response:** (same as before, but filtered)
```json
{
  "tasks": [
    {
      "id": "task-123",
      "repo": "mothership/finance-service",
      "status": "merged",
      "...": "..."
    }
  ],
  "total": 28,
  "page": 1,
  "limit": 20,
  "totalPages": 2
}
```

---

#### `POST /api/tasks` — Create Task with Repo Validation

**Request:**
```json
{
  "description": "Fix payment webhook",
  "repo": "mothership/finance-service",
  "type": "bug-fix",
  "priority": "high"
}
```

**Processing:**
1. Validate user has access to repo via `user-repos` table
2. Fetch repo system prompt (if custom exists)
3. Use `defaultAgent` from repo settings if available
4. Proceed with existing flow

**Response:** (same as before)

---

## 10. Frontend Changes

### 10.1 New Components

#### `RepoSelector` Component

**Location:** `/web/src/components/RepoSelector.tsx`

**Props:**
```typescript
interface RepoSelectorProps {
  selectedRepo: string | 'all';
  onSelectRepo: (repoName: string) => void;
  repos: RepoWithStats[];
  isLoading?: boolean;
  variant?: 'dropdown' | 'tabs' | 'sidebar';
}
```

**Features:**
- Dropdown/tabs/sidebar modes
- Health badge indicators
- Task count display
- Right-click context menu (remove repo)
- Click "+" to add repo
- Loading state while fetching repos

---

#### `RepoStats` Component

**Location:** `/web/src/components/RepoStats.tsx`

**Props:**
```typescript
interface RepoStatsProps {
  repo: string;
  stats: RepoStats;
  period?: '7d' | '30d' | 'all';
  isLoading?: boolean;
}
```

**Display:**
- Health badge with color
- Success rate percentage
- Task count by status
- Completion time
- Failure reasons
- Trend chart (7-day sparkline)

---

#### `RepoSettings` Component

**Location:** `/web/src/components/RepoSettings.tsx`

**Props:**
```typescript
interface RepoSettingsProps {
  repoId: string;
  repo: UserRepo;
  onSave: (updated: UserRepo) => void;
  onRemove: (repoId: string) => void;
  onClose: () => void;
}
```

**Features:**
- Default agent selector dropdown
- Custom system prompt upload/preview
- Stats display
- Remove button with confirmation

---

#### `AddRepoModal` Component

**Location:** `/web/src/components/AddRepoModal.tsx`

**Props:**
```typescript
interface AddRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (repoNames: string[]) => Promise<void>;
  availableRepos: GithubRepo[];
  isLoading?: boolean;
}
```

**Features:**
- Search/filter repos
- Batch selection checkboxes
- Access validation indicators
- Add button (batch add)
- Loading state

---

#### `RepoComparison` Component

**Location:** `/web/src/components/RepoComparison.tsx`

**Props:**
```typescript
interface RepoComparisonProps {
  repos: string[];
  period?: '7d' | '30d' | 'all';
  isLoading?: boolean;
}
```

**Features:**
- Table with metrics per repo
- Sortable columns
- Color-coded health badges
- Chart: success rate over time by repo
- Chart: completion time by repo
- Export CSV / JSON buttons

---

### 10.2 Updated Page Components

#### Dashboard Page (`/web/src/pages/Dashboard.tsx`)

**Changes:**
```typescript
export default function Dashboard() {
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [repos, setRepos] = useState<RepoWithStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Load user's repos on mount
  useEffect(() => {
    fetchUserRepos();
  }, []);

  // Fetch tasks when repo selection changes
  useEffect(() => {
    fetchTasks(selectedRepo);
  }, [selectedRepo]);

  async function fetchUserRepos() {
    setIsLoadingRepos(true);
    try {
      const response = await fetch('/api/users/me/repos?includeStats=true');
      const data = await response.json();
      setRepos(data.repos);
      // Remember last selected repo
      const lastRepo = localStorage.getItem('lastSelectedRepo') || 'all';
      setSelectedRepo(lastRepo);
    } finally {
      setIsLoadingRepos(false);
    }
  }

  async function fetchTasks(repo: string) {
    setIsLoadingTasks(true);
    try {
      const query = repo === 'all' ? '' : `?repo=${repo}`;
      const response = await fetch(`/api/tasks${query}`);
      const data = await response.json();
      setTasks(data.tasks);
    } finally {
      setIsLoadingTasks(false);
    }
  }

  function handleSelectRepo(repo: string) {
    setSelectedRepo(repo);
    localStorage.setItem('lastSelectedRepo', repo);
  }

  return (
    <div className="p-6">
      <div className="flex gap-4">
        <RepoSelector
          selectedRepo={selectedRepo}
          onSelectRepo={handleSelectRepo}
          repos={repos}
          isLoading={isLoadingRepos}
          variant="dropdown"
        />
      </div>

      <div className="mt-6">
        {selectedRepo !== 'all' && (
          <RepoStats
            repo={selectedRepo}
            stats={repos.find(r => r.repoName === selectedRepo)?.stats}
          />
        )}
      </div>

      <TaskList tasks={tasks} isLoading={isLoadingTasks} />
    </div>
  );
}
```

---

#### Task Creation Form (`/web/src/pages/tasks/new.tsx`)

**Changes:**
```typescript
export default function NewTask() {
  const [repos, setRepos] = useState<UserRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  useEffect(() => {
    fetchUserRepos();
  }, []);

  async function fetchUserRepos() {
    const response = await fetch('/api/users/me/repos');
    const data = await response.json();
    setRepos(data.repos);
    setSelectedRepo(data.repos[0]?.repoName || 'mothership/finance-service');
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6">
        <label>Repository</label>
        <select
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
          className="w-full"
        >
          {repos.map(repo => (
            <option key={repo.id} value={repo.repoName}>
              {repo.repoName}
            </option>
          ))}
        </select>
        <small>Default agent: {repos.find(r => r.repoName === selectedRepo)?.defaultAgent}</small>
      </div>

      {/* Rest of form remains same */}
    </form>
  );
}
```

---

#### New Comparison Page (`/web/src/pages/dashboard/compare.tsx`)

```typescript
export default function CompareRepos() {
  const [repos, setRepos] = useState<RepoWithStats[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d'>('7d');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchComparison();
  }, [period]);

  async function fetchComparison() {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/repos/compare/health?period=${period}&userRepos=true`
      );
      const data = await response.json();
      setRepos(data.repos);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="p-6">
      <h1>Repository Comparison</h1>
      <div className="mb-4">
        <select value={period} onChange={(e) => setPeriod(e.target.value as any)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      <RepoComparison repos={repos.map(r => r.repoName)} period={period} />
    </div>
  );
}
```

---

### 10.3 Layout/Navigation Updates

**Header Changes:**
```
┌─────────────────────────────────────────────────────┐
│ AI Pipeline                                         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Repos: All ▼]  [Compare] [Settings]     [👤]   │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Sidebar/Navigation Changes:**
- Add "Repositories" section
- Show list of user's active repos
- Health badges next to each repo
- "Manage Repos" link to settings
- "Compare Repos" link to comparison page

---

## 11. Default Repo Preferences

### 11.1 Remember Last Selected Repo

**Implementation:**
```typescript
// On component mount
const lastSelectedRepo = localStorage.getItem('lastSelectedRepo');
if (lastSelectedRepo) {
  setSelectedRepo(lastSelectedRepo);
} else {
  // First time user
  setSelectedRepo('all');
  localStorage.setItem('lastSelectedRepo', 'all');
}

// On repo selection
function handleSelectRepo(repo: string) {
  setSelectedRepo(repo);
  localStorage.setItem('lastSelectedRepo', repo);
}
```

**Storage:**
- Key: `lastSelectedRepo`
- Value: repo name or `"all"`
- Scope: Per domain, per browser
- Persistence: Browser local storage (survives tab close)

### 11.2 Set Default Agent per Repo

**Implementation:**
- Stored in `user-repos.defaultAgent`
- Used in task creation form as default selection
- Can be overridden before task submission
- Passed to GitHub issue creation (included in issue body for agent reference)

**UI:**
```
When creating task for repo with default agent set:

Repository: [finance-service ▼]
Suggested Agent: Claude Code (repo default)
[Select different agent...] [Use suggested]
```

### 11.3 Server-side User Preferences

**Fields in User schema:**
```typescript
lastSelectedRepo: string; // "mothership/finance-service" or "all"
dashboardAutoRefresh: boolean; // Auto-refresh every 30s
dashboardAutoRefreshIntervalSeconds: number; // 30, 60, 120
dashboardShowHealthBadges: boolean; // Show health indicators
```

**Endpoint to Update Preferences:**
```
PATCH /api/users/me/preferences
Body: {
  dashboardAutoRefresh: true,
  dashboardAutoRefreshIntervalSeconds: 30,
  dashboardShowHealthBadges: true
}
```

---

## 12. Implementation Tasks

### Phase 1: Backend Foundation (Days 1-2)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 1.1 | Create `UserRepo` schema and migration | None | Low |
| 1.2 | Create `RepoStats` schema for caching | None | Low |
| 1.3 | Update `Task` schema with repo index | 1.2 | Low |
| 1.4 | Update `User` schema with preferences | None | Low |
| 1.5 | Create `repos.module.ts` and `repos.service.ts` | 1.1, 1.2 | Medium |
| 1.6 | Implement repo CRUD endpoints | 1.5 | Medium |
| 1.7 | Implement repo stats endpoints | 1.2 | Medium |
| 1.8 | Add GitHub integration for listing user repos | 1.5 | Medium |
| 1.9 | Update `tasks.service.ts` to validate repo access | 1.1, 1.5 | Medium |
| 1.10 | Update task creation to check user-repo association | 1.9 | Low |

---

### Phase 2: GitHub & LLM Integration (Days 2-3)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 2.1 | Implement repo system prompt fetching | 1.5 | Medium |
| 2.2 | Cache repo system prompts | 2.1 | Low |
| 2.3 | Implement custom prompt upload endpoint | 1.5, 2.1 | Low |
| 2.4 | Update LLM service to use repo-specific prompts | 2.1 | Medium |
| 2.5 | Implement repo access validation via GitHub API | 1.8 | Medium |
| 2.6 | Add repo health calculation job (background task) | 1.2 | Medium |
| 2.7 | Create scheduled task to update `RepoStats` daily | 2.6 | Medium |

---

### Phase 3: Frontend Foundation (Days 3-4)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 3.1 | Create `RepoSelector` component (dropdown) | None | Low |
| 3.2 | Create `RepoStats` component | None | Low |
| 3.3 | Create `RepoSettings` modal component | None | Medium |
| 3.4 | Create `AddRepoModal` component | None | Medium |
| 3.5 | Update Dashboard to use RepoSelector | 3.1, 3.2 | Medium |
| 3.6 | Implement repo filtering in task list | 3.5 | Low |
| 3.7 | Update task creation form with repo dropdown | 3.1 | Low |
| 3.8 | Implement localStorage for last selected repo | 3.5 | Low |
| 3.9 | Add dashboard auto-refresh with interval config | 3.5 | Low |

---

### Phase 4: Dashboard Features (Days 4-5)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 4.1 | Create `RepoComparison` component | None | Medium |
| 4.2 | Create `/dashboard/compare` page | 4.1 | Low |
| 4.3 | Implement comparison metrics API | 2.6 | Low |
| 4.4 | Add export CSV/JSON functionality | 4.1 | Low |
| 4.5 | Create health badge indicator component | None | Low |
| 4.6 | Implement health status tooltip | 4.5 | Low |
| 4.7 | Update dashboard header with repo selector | 3.1 | Low |
| 4.8 | Add "Manage Repos" / "Add Repo" UI | 3.3, 3.4 | Low |
| 4.9 | Create repo settings page | 3.3 | Medium |
| 4.10 | Implement default agent selection in task form | 3.7 | Low |

---

### Phase 5: Testing & Refinement (Days 5-6)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 5.1 | Unit tests for `repos.service.ts` | 1.5 | Low |
| 5.2 | Unit tests for repo validation logic | 1.9 | Low |
| 5.3 | Unit tests for health calculation | 2.6 | Medium |
| 5.4 | Integration tests for repo CRUD endpoints | 1.6 | Medium |
| 5.5 | Component tests for RepoSelector | 3.1 | Low |
| 5.6 | Component tests for RepoSettings | 3.3 | Low |
| 5.7 | E2E test: Add repo → Create task → Task appears | 4.8 | High |
| 5.8 | E2E test: Switch repos → Metrics update | 3.5 | High |
| 5.9 | Performance test: Dashboard loads with 10+ repos | 3.5 | Medium |
| 5.10 | Test repo access validation with expired GitHub token | 2.5 | Low |

---

### Phase 6: Deployment & Documentation (Days 6+)

| Task ID | Task | Dependencies | Complexity |
|---------|------|--------------|-----------|
| 6.1 | Update CLAUDE.md with Multi-Repo feature | All | Low |
| 6.2 | Update SPEC.md with new endpoints | All | Low |
| 6.3 | Create migration guide (if needed) | All | Low |
| 6.4 | Update deployment docs | All | Low |
| 6.5 | Verify Railway deployment | All | Medium |
| 6.6 | Update README with feature overview | All | Low |

---

## 13. Estimated Complexity

### By Component

| Component | Complexity | Effort (Hours) | Risk |
|-----------|-----------|----------------|------|
| **Backend** | | | |
| User-Repo schema & CRUD | Low | 4 | Low |
| Repo stats calculation | Medium | 6 | Low |
| GitHub repo access validation | Medium | 5 | Medium |
| Repo system prompt fetching | Medium | 4 | Low |
| Health indicator calculation | Medium | 6 | Medium |
| Background stats job | Medium | 5 | Medium |
| **Frontend** | | | |
| RepoSelector component | Low | 3 | Low |
| RepoStats component | Low | 3 | Low |
| RepoSettings modal | Medium | 5 | Low |
| AddRepoModal | Medium | 5 | Low |
| Dashboard integration | Medium | 6 | Low |
| Comparison page | Medium | 5 | Low |
| Health badges & indicators | Low | 3 | Low |
| LocalStorage preference management | Low | 2 | Low |
| **Integration** | | | |
| API endpoint updates | Low | 4 | Low |
| Task creation with repo validation | Low | 3 | Low |
| **Testing** | | | |
| Unit tests | Low | 6 | Low |
| Component tests | Low | 6 | Low |
| E2E tests | High | 8 | Medium |
| **Total** | | **94-100 hours** | **Low-Medium** |

---

### By Phase

| Phase | Duration | Complexity | Blockers |
|-------|----------|-----------|----------|
| Phase 1: Backend Foundation | 2 days | Medium | None |
| Phase 2: GitHub & LLM Integration | 1 day | Medium | Phase 1 complete |
| Phase 3: Frontend Foundation | 1.5 days | Medium | Phase 1 complete |
| Phase 4: Dashboard Features | 1.5 days | Low | Phase 3 complete |
| Phase 5: Testing & Refinement | 1.5 days | Medium | Phase 4 complete |
| Phase 6: Deployment & Docs | 1 day | Low | Phase 5 complete |
| **Total** | **9 days** | **Medium** | None |

---

### Risk Assessment

**Low Risk Items:**
- Repo CRUD endpoints (standard NestJS patterns)
- Frontend components (reusable patterns)
- LocalStorage preference management
- Health badge styling

**Medium Risk Items:**
- GitHub API integration (rate limiting, auth issues)
- Background stats job reliability
- Cache invalidation logic
- Health calculation formula accuracy

**High Risk Items:**
- User-repo association consistency (data integrity)
- Performance with many repos (10+ repos with large task counts)
- Real-time stats updates vs. cache staleness
- Cross-repo filtering query performance

**Mitigation Strategies:**
1. Add comprehensive validation on user-repo associations
2. Paginate repo lists in UI (max 10 visible at a time)
3. Cache health stats for 30-60 minutes
4. Add database indexes on `(userId, repoName)` and `(repo, createdAt)`
5. Use server-side filtering (not client-side) for performance
6. Add health check to verify background job health

---

## Next Steps

1. **Design Review:** Review this spec with team to ensure alignment
2. **Create Feature Branch:** `git checkout -b feat/multi-repo-dashboard`
3. **Assign Tasks:** Distribute Phase 1 tasks to backend agent
4. **Start Phase 1:** Begin schema and service implementation
5. **Parallel Work:** Start Phase 3 (frontend) once Phase 1 is 50% complete
6. **Integration:** Merge and test in staging before production deployment

---

## Appendix A: Database Schema Diagrams

### User-Repo Relationship

```
┌─────────────────┐          ┌──────────────────┐
│    users        │          │    user-repos    │
├─────────────────┤          ├──────────────────┤
│ _id             │◄─────────│ userId           │
│ username        │ 1:N      │ repoName         │
│ email           │          │ defaultAgent     │
│ lastSelectedRepo│          │ customPrompt     │
│ activeRepos[]   │          │ isActive         │
└─────────────────┘          │ addedAt          │
                             │ removedAt        │
                             └──────────────────┘
```

### Task-Repo Relationship

```
┌─────────────────┐          ┌──────────────────┐
│    tasks        │          │    repo-stats    │
├─────────────────┤          ├──────────────────┤
│ _id             │          │ _id              │
│ description     │          │ repoName         │
│ repo            │◄────────►│ period (7d/30d)  │
│ status          │ N:1      │ totalTasks       │
│ createdBy       │          │ statusBreakdown  │
│ ...             │          │ successRate      │
└─────────────────┘          │ trend[]          │
                             │ lastCalcAt       │
                             └──────────────────┘
```

---

## Appendix B: Example User Flow

### "New Developer Onboarding with Multiple Repos"

1. **Day 1:** Developer logs in for the first time
   - Dashboard shows "All Repos (0 tasks)" — empty state
   - Clicks "Add Repo"
   - Selects `finance-service` and `user-service`
   - Both repos now show in selector with 0 tasks

2. **Day 2:** Creates first task in finance-service
   - Selects repo: `finance-service`
   - Submits task → validation passes (has access via user-repos)
   - Task created, assigned to default agent (claude-code for finance)

3. **Day 3:** Works on both services
   - Switches between repos via dropdown
   - Sees tasks unique to each repo
   - Dashboard remembers last selected repo

4. **Day 5:** Checks metrics
   - Visits `/dashboard/compare`
   - Sees success rate: finance-service 82%, user-service 67%
   - Identifies user-service needs attention

5. **Day 6:** Configures repo defaults
   - Opens repo settings for user-service
   - Changes default agent to claude-code (from copilot)
   - Uploads custom system prompt
   - New tasks for user-service now use custom config

---

**End of Specification Document**
