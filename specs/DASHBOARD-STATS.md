# Dashboard Stats — Feature Specification

**Version:** 1.0
**Date:** February 15, 2026
**Status:** Specification
**Component:** Analytics & Observability
**Tech Stack:** NestJS 11 (backend), React + Recharts (frontend), MongoDB 7

---

## 1. Overview

### Problem Statement

Users and administrators of the AI Pipeline need visibility into task metrics, trends, and system performance. Currently, the dashboard shows only a basic task list without aggregate statistics, making it difficult to understand:

- Throughput and volume trends
- System reliability (success rates)
- Performance characteristics (time to PR, time to merge)
- Resource utilization across repos and agents
- User activity patterns

### Solution

Introduce a **Dashboard Stats** page displaying real-time and aggregated metrics across multiple dimensions (time ranges, repos, agents, task types, users). This provides:

1. **Executive Overview** — High-level KPIs with trend indicators
2. **Drill-Down Analytics** — Filterable charts for investigation
3. **Comparison Tools** — Side-by-side repo/agent performance
4. **Historical Trends** — Time-series data showing system evolution

### Success Criteria

- Stats page renders in < 2 seconds (including API calls)
- Real-time updates via WebSocket or 30-second polling
- Support filtering by time range, repo, task type, agent, and user
- Pre-computed stats for common queries (< 100ms response time)
- No impact on task creation/dispatch performance (separate read model)
- Mobile-responsive charts and cards

---

## 2. User Stories

### 2.1 Core User (Developer)

**As a developer,**
I want to see how many tasks have been completed this week,
so that I can understand team throughput and celebrate wins.

**Acceptance Criteria:**
- Dashboard shows "Tasks Completed" card with number and week-over-week trend
- Card is visible on initial page load
- Clicking the card filters task list to show completed tasks only

---

**As a developer,**
I want to see the success rate of all tasks (merged vs. failed),
so that I can assess system reliability.

**Acceptance Criteria:**
- Dashboard shows "Success Rate" as percentage with pie/donut chart
- Chart shows breakdown: merged, failed, in-progress
- Hovering on chart slice shows count and percentage
- Success rate is color-coded: green (>90%), yellow (70-90%), red (<70%)

---

**As a developer,**
I want to filter stats by repository,
so that I can focus on specific service performance.

**Acceptance Criteria:**
- "Repository" dropdown selector in stats sidebar
- Available repos populated from tasks in database
- Selecting a repo filters all stats and charts immediately
- URL includes `?repo=mothership/finance-service` for bookmarking

---

**As a developer,**
I want to see time-to-value metrics (time to PR, time to merge),
so that I understand system efficiency.

**Acceptance Criteria:**
- Stats show "Avg Time to PR" and "Avg Time to Merge" in hh:mm:ss format
- Both metrics show 7-day and 30-day averages
- Charts display distribution curves (fastest, median, slowest)
- Outliers are flagged (tasks taking >24 hours)

---

### 2.2 Agent Manager / Admin

**As an admin,**
I want to see task distribution by agent (Claude Code, Codex, Copilot),
so that I can understand agent utilization and make resource allocation decisions.

**Acceptance Criteria:**
- "Tasks by Agent" stacked bar chart showing past 30 days
- X-axis: date, Y-axis: task count
- Series: claude-code, codex, copilot (color-coded)
- Clicking a series filters task list to that agent
- Tooltip shows daily breakdown

---

**As an admin,**
I want to see success rate broken down by agent,
so that I can identify if one agent is underperforming.

**Acceptance Criteria:**
- "Agent Performance" table with columns:
  - Agent name
  - Total tasks
  - Merged count
  - Failed count
  - Success rate %
  - Avg time to PR
  - Avg time to merge
- Rows sorted by success rate (descending)
- Color-code agent names by performance tier

---

**As an admin,**
I want to see task distribution by user,
so that I can identify power users and understand workload balance.

**Acceptance Criteria:**
- "Tasks by User" horizontal bar chart (top 10 users)
- Bars sorted by count (descending)
- Hover shows user name, count, and percentile
- "View all users" link expands to full list (paginated)
- Hidden by default (role-based, admins only)

---

**As an admin,**
I want to filter stats by time range (Today, 7 days, 30 days, Custom),
so that I can analyze trends over different periods.

**Acceptance Criteria:**
- Time range selector in stats sidebar
- Predefined options: Today, 7 days, 30 days, 90 days, All time
- Custom date picker for arbitrary ranges
- Stats update instantly when time range changes
- URL includes `?from=2026-01-15&to=2026-02-15` for custom ranges

---

**As an admin,**
I want to export stats to CSV,
so that I can share reports with stakeholders.

**Acceptance Criteria:**
- "Export" button generates CSV file with current stats
- CSV includes columns: date, metric_name, value, filter_context (repo, agent, etc.)
- Exported filename includes date range: `stats-2026-01-15-to-2026-02-15.csv`
- Export respects current filters (repo, agent, time range)

---

### 2.3 Analytics / Compliance

**As a compliance officer,**
I want to see task volume and success metrics by status,
so that I can demonstrate system reliability to auditors.

**Acceptance Criteria:**
- "Task Status Breakdown" pie chart showing:
  - received (pending analysis)
  - analyzing
  - needs_clarification
  - dispatched
  - coding
  - pr_open
  - merged (terminal success)
  - failed (terminal failure)
- Percentages add to 100%
- "In Progress" subset shows expected completion time (ETA)

---

**As a compliance officer,**
I want to see failure reasons and error messages,
so that I can report on system issues.

**Acceptance Criteria:**
- "Recent Failures" table showing:
  - Task ID
  - Description (truncated)
  - Failure reason (e.g., "GitHub API 401", "LLM timeout")
  - Failed at timestamp
  - Link to task detail page
- Sortable by date, with newest first
- Pagination: 10 per page
- Limit to last 30 days (configurable)

---

---

## 3. Key Metrics

### 3.1 Volume Metrics

| Metric | Definition | Granularity | Period Options |
|--------|-----------|-------------|-----------------|
| **Tasks Created** | Count of tasks with status >= `received` | Daily | Today, 7d, 30d, All |
| **Tasks Dispatched** | Count reaching `dispatched` or beyond | Daily | Same |
| **Tasks Completed** | Count reaching `merged` status | Daily | Same |
| **Completion Rate** | Completed / Dispatched * 100 | Daily | Same |
| **In-Progress Tasks** | Count with status in [analyzing, dispatched, coding, pr_open] | Snapshot | N/A (real-time) |

### 3.2 Quality Metrics

| Metric | Definition | Format | Notes |
|--------|-----------|--------|-------|
| **Success Rate** | (Merged / (Merged + Failed)) * 100 | Percentage | Excludes in-progress tasks |
| **Failure Rate** | (Failed / (Merged + Failed)) * 100 | Percentage | Complements success rate |
| **Clarification Rate** | (Tasks with clarification needed / Total tasks) * 100 | Percentage | LLM quality indicator |
| **Agent Success Rates** | Per-agent breakdown of success % | Percentage | Separate cards for each agent |

### 3.3 Performance Metrics

| Metric | Definition | Format | Notes |
|--------|-----------|--------|-------|
| **Avg Time to PR** | Mean of (pr_opened_at - dispatched_at) for all tasks | hh:mm:ss | Agent performance indicator |
| **Median Time to PR** | 50th percentile | hh:mm:ss | Resilient to outliers |
| **P95 Time to PR** | 95th percentile | hh:mm:ss | Identifies slow scenarios |
| **Avg Time to Merge** | Mean of (merged_at - pr_opened_at) | hh:mm:ss | Review/merge speed |
| **Median Time to Merge** | 50th percentile | hh:mm:ss | Typical merge turnaround |
| **P95 Time to Merge** | 95th percentile | hh:mm:ss | Worst-case merge time |

### 3.4 Classification Metrics

| Metric | Definition | Chart Type | Drill-Down |
|--------|-----------|-----------|-----------|
| **Tasks by Status** | Count per status (received, analyzing, ..., merged, failed) | Pie / Donut | Click to filter list |
| **Tasks by Task Type** | Count per type (bug-fix, feature, refactor, test-coverage) | Horizontal bar | Sort ascending |
| **Tasks by Repo** | Count per repo (mothership/*) | Bar (top 10) | "View all" expands list |
| **Tasks by Agent** | Count per agent (claude-code, codex, copilot) | Stacked area | Time-series per agent |
| **Tasks by User** | Count per user (mothership org) | Horizontal bar (top 10) | "View all" with pagination |

### 3.5 Trend Metrics

| Metric | Definition | Chart | Period |
|--------|-----------|-------|--------|
| **Daily Task Volume** | Tasks created per day | Line + area | 7d, 30d, 90d |
| **Daily Completion** | Tasks merged per day | Line | 7d, 30d, 90d |
| **Weekly Success Rate** | Avg success % per week | Line | 4 weeks, 12 weeks, 52 weeks |
| **Agent Utilization Trend** | Stacked area of agent task counts | Stacked area | 7d, 30d, 90d |

---

## 4. Visualizations

### 4.1 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard Stats                              [Export] [Filters] │
├──────────────────┬────────────────────────────────────────────┤
│  SIDEBAR         │  MAIN CONTENT                              │
│  (Filters)       │                                            │
│                  │  [KPI Cards Row]                           │
│  ☐ Repository    │  ┌──────┬──────┬──────┬──────┐            │
│    [selector ▾]  │  │ Tasks│ Comp │Success│  Avg│            │
│                  │  │Created│Rate│ Rate│ Time│            │
│  ☐ Time Range    │  │  42  │  15 │ 93% │ 4h 23m           │
│    [selector ▾]  │  └──────┴──────┴──────┴──────┘            │
│                  │                                            │
│  ☐ Agent         │  [Charts Row 1]                           │
│    [selector ▾]  │  ┌──────────────────┐  ┌──────────────┐  │
│    ☑ Claude Code │  │ Status Breakdown │  │ Success Rate │  │
│    ☑ Codex       │  │   (Pie Chart)    │  │ (Donut Chart)   │
│    ☑ Copilot     │  └──────────────────┘  └──────────────┘  │
│                  │                                            │
│  ☐ Task Type     │  [Charts Row 2]                           │
│    ☑ Bug-fix     │  ┌──────────────────┐  ┌──────────────┐  │
│    ☑ Feature     │  │ Avg Time to PR   │  │ Agent Perf   │  │
│    ☑ Refactor    │  │  (Bar Chart)     │  │ (Table)      │  │
│    ☑ Test Cov.   │  └──────────────────┘  └──────────────┘  │
│                  │                                            │
│  ☐ User (Admin)  │  [Charts Row 3]                           │
│    [search box]  │  ┌──────────────────┐  ┌──────────────┐  │
│                  │  │ Daily Volume     │  │ Tasks by     │  │
│  [Reset Filters] │  │ (Line Chart)     │  │ Repo (Bar)   │  │
└──────────────────┴────────────────────────────────────────────┘
```

### 4.2 Chart Components

#### KPI Cards

```
┌─────────────────────────────────┐
│ Tasks Created This Week         │
│                                 │
│  42 ↑ 15% from last week        │
│                                 │
│ [More Details] [See List]       │
└─────────────────────────────────┘
```

**Features:**
- Large bold number
- Trend arrow (↑↓) with percentage change
- Color-coded: green (up), red (down), neutral (flat)
- Clickable to drill-down into filtered task list
- Optional sparkline showing 7-day trend

---

#### Status Breakdown (Pie Chart)

**Chart Type:** Donut/Pie
**Library:** Recharts (custom legend)
**Data Source:** Task status counts

```javascript
[
  { name: "Merged", value: 35, count: 35 },
  { name: "In Progress", value: 8, count: 8 },
  { name: "Failed", value: 2, count: 2 },
  { name: "Other", value: 3, count: 3 }
]
```

**Interactivity:**
- Hover: highlight segment + show tooltip with name, count, %
- Click: filter task list to that status
- Legend: clickable to toggle segment visibility

---

#### Success Rate (Donut Chart)

**Chart Type:** Donut with center text
**Color Scheme:**
- Merged: green (#10b981)
- Failed: red (#ef4444)
- In-Progress: gray (#9ca3af)

```javascript
[
  { name: "Merged", value: 35 },
  { name: "Failed", value: 2 }
]
```

**Center Text:**
```
93%
Success Rate
```

---

#### Avg Time to PR / Merge (Bar Chart)

**Chart Type:** Grouped bar chart
**Data:**
```javascript
[
  { label: "Avg", value: 4.38, unit: "hours" },
  { label: "Median", value: 3.5, unit: "hours" },
  { label: "P95", value: 12.2, unit: "hours" }
]
```

**Color Scheme:**
- Avg: blue
- Median: green
- P95: orange

---

#### Daily Volume (Line + Area Chart)

**Chart Type:** Recharts `ComposedChart`
**X-axis:** Date (YYYY-MM-DD)
**Y-axis:** Task count
**Series:**
- Area (filled): Tasks created (light blue)
- Line: Tasks merged (solid green)
- Line: Tasks failed (dashed red)

```javascript
[
  { date: "2026-02-08", created: 5, merged: 3, failed: 0 },
  { date: "2026-02-09", created: 8, merged: 6, failed: 1 },
  { date: "2026-02-10", created: 12, merged: 10, failed: 1 },
  // ...
]
```

---

#### Agent Performance (Table)

**Columns:**
| Agent | Total | Merged | Failed | Success % | Avg Time PR | Avg Time Merge |
|-------|-------|--------|--------|-----------|------------|-----------------|
| Claude Code | 42 | 40 | 2 | 95% | 4h 23m | 2h 15m |
| Codex | 18 | 17 | 1 | 94% | 2h 10m | 1h 45m |
| Copilot | 8 | 8 | 0 | 100% | 45m | 30m |

**Features:**
- Sortable by clicking column headers
- Color-coded agent names
- Conditional formatting on success %
- Row click opens agent detail view (future enhancement)

---

#### Tasks by Repo (Horizontal Bar)

**Chart Type:** BarChart (horizontal layout)
**Data:** Top 10 repos, sorted by count descending

```javascript
[
  { name: "mothership/finance-service", value: 47 },
  { name: "mothership/auth-service", value: 12 },
  { name: "mothership/notifications", value: 8 },
  // ...
]
```

**Interactivity:**
- Hover: highlight bar, show tooltip with count
- Click: filter stats to selected repo

---

#### Tasks by User (Horizontal Bar, Admin Only)

**Chart Type:** BarChart (horizontal layout)
**Data:** Top 10 users, sorted by count descending

```javascript
[
  { name: "alice@example.com", value: 18 },
  { name: "bob@example.com", value: 15 },
  { name: "charlie@example.com", value: 12 },
  // ...
]
```

**Features:**
- Hidden by default (RBAC: admin role only)
- "View all users" link opens modal with paginated list
- Pagination: 20 users per page

---

---

## 5. Time Range Filters

### 5.1 Predefined Ranges

| Option | Duration | Label | Use Case |
|--------|----------|-------|----------|
| **Today** | Last 24 hours | Today | Daily check-in |
| **7 Days** | Last 7 days | This Week | Weekly review |
| **30 Days** | Last 30 days | This Month | Monthly report |
| **90 Days** | Last 90 days | Q-to-Date | Quarterly trends |
| **All Time** | Database minimum → now | All Time | Historical view |

### 5.2 Custom Date Range

**UI:**
```
┌─────────────────────────┐
│ Custom Date Range       │
│ From: [2026-01-15] ◄► │
│ To:   [2026-02-15] ◄► │
│ [Apply] [Clear]         │
└─────────────────────────┘
```

**Behavior:**
- Uses date picker (HTML5 or third-party: react-datepicker)
- Validates: `from <= to` and `from >= database.min_date`
- Applies immediately on "Apply" click
- URL updates to reflect range: `?from=2026-01-15&to=2026-02-15`

### 5.3 URL State Management

All filters are reflected in the URL query string for bookmarking:

```
/dashboard/stats?repo=mothership/finance-service&agent=claude-code&timeRange=7d&from=2026-02-08&to=2026-02-15
```

Parameters:
- `repo` — Repository name (or "all")
- `agent` — Agent name (or "all", supports comma-separated for multi-select)
- `timeRange` — Preset (today, 7d, 30d, 90d, alltime) or "custom"
- `from` — ISO date string (custom range start)
- `to` — ISO date string (custom range end)

---

## 6. Data Aggregation Strategy

### 6.1 Real-Time vs. Pre-Computed

**Real-Time Queries (< 100ms):**
- Task status counts (indexed on `status` field)
- Recent failures (indexed on `status`, `createdAt`)
- In-progress task count (indexed on `status`)

**Pre-Computed (via background jobs):**
- Daily volume trends (stored in `stats_snapshots` collection)
- Weekly success rates (stored in `stats_snapshots` collection)
- Agent performance metrics (stored in `agent_stats` collection)
- User activity (stored in `user_stats` collection)

**Hybrid (Cache + Refresh):**
- Time-to-PR / time-to-merge percentiles (compute on demand, cache for 1 hour)
- Success rate by agent (compute on demand, cache for 5 minutes)

### 6.2 Stats Snapshots Collection

**Purpose:** Pre-aggregate daily metrics to avoid expensive calculations on dashboard load.

**Schema:**

```javascript
// Collection: stats_snapshots
{
  _id: ObjectId,
  date: Date,                    // YYYY-MM-DD at 00:00 UTC
  aggregation_period: "daily",   // daily, weekly, monthly
  repo: String,                  // null = all repos
  agent: String,                 // null = all agents

  // Counts
  tasks_created: Number,
  tasks_dispatched: Number,
  tasks_merged: Number,
  tasks_failed: Number,

  // Timings (in seconds)
  avg_time_to_pr: Number,
  median_time_to_pr: Number,
  p95_time_to_pr: Number,
  avg_time_to_merge: Number,
  median_time_to_merge: Number,
  p95_time_to_merge: Number,

  // Rates
  success_rate: Number,          // 0-100 (percentage)
  clarification_rate: Number,    // 0-100 (percentage)

  // Task type breakdown
  task_type_breakdown: {
    "bug-fix": Number,
    "feature": Number,
    "refactor": Number,
    "test-coverage": Number
  },

  // Status breakdown
  status_breakdown: {
    "received": Number,
    "analyzing": Number,
    "needs_clarification": Number,
    "dispatched": Number,
    "coding": Number,
    "pr_open": Number,
    "merged": Number,
    "failed": Number
  },

  createdAt: Date,               // Snapshot creation timestamp
  updatedAt: Date
}
```

**Indexes:**
```javascript
{ date: -1, repo: 1, agent: 1 }
{ repo: 1, agent: 1, date: -1 }
{ aggregation_period: 1, date: -1 }
```

### 6.3 Agent Stats Collection

**Purpose:** Track per-agent performance independently.

**Schema:**

```javascript
// Collection: agent_stats
{
  _id: ObjectId,
  agent: String,                 // claude-code, codex, copilot
  period_start: Date,            // 7d_rolling, 30d_rolling
  period_type: String,           // "7d_rolling", "30d_rolling"

  // Totals
  total_tasks: Number,
  total_merged: Number,
  total_failed: Number,

  // Derived
  success_rate: Number,          // 0-100
  failure_rate: Number,          // 0-100

  // Timings (seconds)
  avg_time_to_pr: Number,
  avg_time_to_merge: Number,

  // Breakdown by task type
  task_type_stats: {
    "bug-fix": { total: Number, merged: Number, success_rate: Number },
    "feature": { ... },
    "refactor": { ... },
    "test-coverage": { ... }
  },

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
```javascript
{ agent: 1, period_type: 1, period_start: -1 }
{ period_type: 1, period_start: -1 }
```

### 6.4 User Stats Collection

**Purpose:** Track per-user activity (admin visibility only).

**Schema:**

```javascript
// Collection: user_stats
{
  _id: ObjectId,
  user_id: String,               // GitHub username or email
  user_email: String,            // normalized email

  // Period
  period: String,                // "7d", "30d", "all_time"
  period_start: Date,
  period_end: Date,

  // Activity
  tasks_created: Number,
  tasks_dispatched: Number,
  tasks_merged: Number,
  tasks_failed: Number,

  // Derived
  success_rate: Number,          // For this user's tasks
  avg_task_time_to_pr: Number,   // In seconds

  // Breakdown
  agent_distribution: {
    "claude-code": Number,
    "codex": Number,
    "copilot": Number
  },

  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
```javascript
{ user_id: 1, period: 1, period_start: -1 }
{ period: 1, period_start: -1 }
```

### 6.5 Refresh Strategy

**Daily Snapshots (Batch Job at 00:05 UTC):**

```javascript
// Pseudocode
daily_snapshot_job():
  for each (date, repo, agent) combination:
    snapshot = compute_daily_stats(date, repo, agent)
    db.stats_snapshots.insertOne(snapshot)
```

**Rolling Agent Stats (Every 5 minutes):**

```javascript
// Pseudocode
rolling_stats_job():
  for each agent in [claude-code, codex, copilot]:
    stats_7d = compute_agent_stats(agent, "7d_rolling")
    stats_30d = compute_agent_stats(agent, "30d_rolling")
    db.agent_stats.updateOne(
      { agent, period_type: "7d_rolling" },
      { $set: stats_7d },
      { upsert: true }
    )
    db.agent_stats.updateOne(
      { agent, period_type: "30d_rolling" },
      { $set: stats_30d },
      { upsert: true }
    )
```

**Rolling User Stats (Every 10 minutes):**

```javascript
// Pseudocode
rolling_user_stats_job():
  users = db.tasks.distinct("createdBy")
  for each user:
    stats_7d = compute_user_stats(user, "7d")
    stats_30d = compute_user_stats(user, "30d")
    db.user_stats.updateMany(
      { user_id: user },
      [{ $set: stats_7d }, { $set: stats_30d }],
      { upsert: true }
    )
```

---

## 7. Database Changes

### 7.1 New Collections

```javascript
// 1. stats_snapshots
db.createCollection("stats_snapshots", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["date", "tasks_created"],
      properties: {
        _id: { bsonType: "objectId" },
        date: { bsonType: "date" },
        aggregation_period: { enum: ["daily", "weekly", "monthly"] },
        repo: { bsonType: "string" },
        agent: { bsonType: "string" },
        tasks_created: { bsonType: "int" },
        // ... (see schema above)
      }
    }
  }
});

// 2. agent_stats
db.createCollection("agent_stats", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["agent", "period_type"],
      properties: {
        _id: { bsonType: "objectId" },
        agent: { enum: ["claude-code", "codex", "copilot"] },
        period_type: { enum: ["7d_rolling", "30d_rolling"] },
        // ... (see schema above)
      }
    }
  }
});

// 3. user_stats
db.createCollection("user_stats", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["user_id", "period"],
      properties: {
        _id: { bsonType: "objectId" },
        user_id: { bsonType: "string" },
        period: { enum: ["7d", "30d", "all_time"] },
        // ... (see schema above)
      }
    }
  }
});
```

### 7.2 New Indexes

```javascript
// stats_snapshots
db.stats_snapshots.createIndex({ date: -1, repo: 1, agent: 1 });
db.stats_snapshots.createIndex({ repo: 1, agent: 1, date: -1 });
db.stats_snapshots.createIndex({ aggregation_period: 1, date: -1 });

// agent_stats
db.agent_stats.createIndex({ agent: 1, period_type: 1, period_start: -1 });
db.agent_stats.createIndex({ period_type: 1, period_start: -1 });

// user_stats
db.user_stats.createIndex({ user_id: 1, period: 1, period_start: -1 });
db.user_stats.createIndex({ period: 1, period_start: -1 });
```

### 7.3 Schema Changes to Existing Task Collection

**No schema changes required.** The existing `Task` schema has all necessary fields:
- `status`, `repo`, `createdAt`, `dispatchedAt`, `completedAt`, `createdBy`, `recommendedAgent`, `taskType`, `githubPrStatus`
- Events already embedded with timestamps for PR open/merge detection

**However, verify these indexes exist on `tasks` collection:**

```javascript
// Existing indexes (verify present)
db.tasks.createIndex({ status: 1 });
db.tasks.createIndex({ repo: 1 });
db.tasks.createIndex({ createdAt: -1 });
db.tasks.createIndex({ createdBy: 1 });
db.tasks.createIndex({ recommendedAgent: 1 });

// New helpful indexes for stats queries
db.tasks.createIndex({ status: 1, createdAt: -1 });
db.tasks.createIndex({ repo: 1, status: 1, createdAt: -1 });
db.tasks.createIndex({ recommendedAgent: 1, status: 1, createdAt: -1 });
```

---

## 8. Caching Strategy

### 8.1 Query Cache Layers

**Layer 1: Database — Pre-Computed Stats (Cold)**
- Data source: `stats_snapshots`, `agent_stats`, `user_stats` collections
- Refresh: Batch jobs (daily for snapshots, 5-min for agent, 10-min for user)
- Response time: 50-100ms

**Layer 2: Application Memory Cache (Warm)**
- In-memory cache (Node-cache or similar) for frequently accessed queries
- TTL: 5 minutes for agent stats, 10 minutes for snapshots
- Response time: < 5ms

**Layer 3: HTTP Cache Headers (Browser Cache)**
- Cache-Control headers on stats API endpoints
- Max-age: 5 minutes for non-admin endpoints, 1 minute for admin
- Revalidation on user action (filter change) via timestamp check

**Layer 4: Client-Side State Management**
- React Query (SWR) with automatic refetch
- Refetch interval: 30 seconds for dashboard stats
- Refetch on window focus
- Manual refresh button for admin control

### 8.2 Cache Invalidation Triggers

| Event | Action | TTL |
|-------|--------|-----|
| Task created | Invalidate daily snapshot (current date) | Immediate |
| Task status changed | Invalidate agent stats, user stats | Immediate |
| Task merged / failed | Invalidate success rate cache | Immediate |
| Scheduled batch job | Refresh pre-computed collections | On schedule |

### 8.3 Cache Implementation (Node-cache)

```typescript
// src/stats/stats.cache.ts
import NodeCache from "node-cache";

export class StatsCache {
  private cache = new NodeCache({ stdTTL: 300 }); // 5 min default

  getKey(query: StatsQuery): string {
    return `stats:${query.repo}:${query.agent}:${query.timeRange}`;
  }

  get<T>(query: StatsQuery): T | undefined {
    return this.cache.get(this.getKey(query)) as T | undefined;
  }

  set<T>(query: StatsQuery, value: T, ttl: number = 300): void {
    this.cache.set(this.getKey(query), value, ttl);
  }

  invalidate(pattern?: string): void {
    if (pattern) {
      const keys = this.cache.keys().filter(k => k.includes(pattern));
      keys.forEach(k => this.cache.del(k));
    } else {
      this.cache.flushAll();
    }
  }
}
```

### 8.4 Cache Headers on API Responses

```typescript
// src/stats/stats.controller.ts
@Get('/metrics')
@UseInterceptors(CacheInterceptor)
getMetrics(@Query() query: StatsQuery) {
  // Set Cache-Control headers
  // response.setHeader('Cache-Control', 'public, max-age=300');

  return this.statsService.getMetrics(query);
}
```

---

## 9. API Endpoints

### 9.1 Base Stats Endpoint

**GET /api/stats/metrics**

**Description:** Fetch aggregated metrics for dashboard display.

**Query Parameters:**
```
GET /api/stats/metrics?repo=mothership/finance-service&agent=claude-code&timeRange=7d&from=2026-02-08&to=2026-02-15
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `repo` | string | all | Filter by repository (e.g., `mothership/finance-service`) or `all` |
| `agent` | string | all | Filter by agent: `claude-code`, `codex`, `copilot`, or `all` |
| `timeRange` | enum | 7d | `today`, `7d`, `30d`, `90d`, `alltime`, or `custom` |
| `from` | ISO8601 | — | Start date (required if `timeRange=custom`) |
| `to` | ISO8601 | — | End date (required if `timeRange=custom`) |
| `taskType` | string | all | Filter by task type: `bug-fix`, `feature`, `refactor`, `test-coverage` |
| `status` | string | all | Filter by status (comma-separated) |

**Response (200):**

```json
{
  "period": {
    "from": "2026-02-08T00:00:00Z",
    "to": "2026-02-15T23:59:59Z",
    "label": "Last 7 days"
  },
  "filters": {
    "repo": "mothership/finance-service",
    "agent": "all",
    "taskType": "all",
    "status": "all"
  },
  "volume": {
    "tasksCreated": 42,
    "tasksDispatched": 40,
    "tasksMerged": 35,
    "tasksFailed": 2,
    "tasksInProgress": 3
  },
  "quality": {
    "successRate": 94.6,
    "failureRate": 5.4,
    "clarificationRate": 8.5
  },
  "performance": {
    "avgTimeToPr": 15540,          // seconds (4h 19m)
    "medianTimeToPr": 12600,       // 3h 30m
    "p95TimeToPr": 43200,          // 12h
    "avgTimeToMerge": 8100,        // 2h 15m
    "medianTimeToMerge": 5400,     // 1h 30m
    "p95TimeToMerge": 21600        // 6h
  },
  "breakdown": {
    "byStatus": {
      "received": 0,
      "analyzing": 1,
      "needs_clarification": 0,
      "dispatched": 1,
      "coding": 1,
      "pr_open": 0,
      "merged": 35,
      "failed": 2
    },
    "byTaskType": {
      "bug-fix": 18,
      "feature": 12,
      "refactor": 8,
      "test-coverage": 4
    },
    "byAgent": {
      "claude-code": 22,
      "codex": 15,
      "copilot": 5
    },
    "byRepo": {
      "mothership/finance-service": 42
    }
  },
  "trends": {
    "completionTrend": 8.3,         // % change from previous period
    "successRateTrend": 2.1,        // % change
    "avgTimeToPrTrend": -5.2        // % change (negative = faster)
  },
  "cached": true,
  "cachedAt": "2026-02-15T15:30:45Z",
  "expiresAt": "2026-02-15T15:35:45Z"
}
```

---

**GET /api/stats/daily-volume**

**Description:** Time-series data for daily volume chart.

**Query Parameters:**
```
GET /api/stats/daily-volume?repo=all&timeRange=30d
```

**Response (200):**

```json
{
  "data": [
    {
      "date": "2026-01-15",
      "tasksCreated": 5,
      "tasksMerged": 3,
      "tasksFailed": 0
    },
    {
      "date": "2026-01-16",
      "tasksCreated": 8,
      "tasksMerged": 6,
      "tasksFailed": 1
    },
    // ...
  ],
  "period": {
    "from": "2026-01-15T00:00:00Z",
    "to": "2026-02-15T23:59:59Z"
  }
}
```

---

**GET /api/stats/agent-performance**

**Description:** Per-agent performance metrics (success rate, timings, etc.).

**Query Parameters:**
```
GET /api/stats/agent-performance?timeRange=30d
```

**Response (200):**

```json
{
  "agents": [
    {
      "name": "claude-code",
      "totalTasks": 42,
      "mergedCount": 40,
      "failedCount": 2,
      "successRate": 95.2,
      "avgTimeToPr": 15540,
      "avgTimeToMerge": 8100,
      "taskBreakdown": {
        "bug-fix": { "total": 18, "merged": 17, "successRate": 94.4 },
        "feature": { "total": 12, "merged": 12, "successRate": 100.0 },
        "refactor": { "total": 8, "merged": 8, "successRate": 100.0 },
        "test-coverage": { "total": 4, "merged": 3, "successRate": 75.0 }
      }
    },
    {
      "name": "codex",
      "totalTasks": 18,
      "mergedCount": 17,
      "failedCount": 1,
      "successRate": 94.4,
      "avgTimeToPr": 8640,
      "avgTimeToMerge": 5400,
      "taskBreakdown": { ... }
    },
    // ...
  ],
  "period": { ... }
}
```

---

**GET /api/stats/user-activity** (Admin Only)

**Description:** Per-user task activity (admin endpoint, role-protected).

**Query Parameters:**
```
GET /api/stats/user-activity?timeRange=30d&page=1&limit=20
```

**Response (200):**

```json
{
  "users": [
    {
      "userId": "alice@example.com",
      "tasksCreated": 18,
      "tasksMerged": 15,
      "tasksFailed": 1,
      "successRate": 93.8,
      "avgTimeToPr": 16200,
      "agentDistribution": {
        "claude-code": 10,
        "codex": 5,
        "copilot": 3
      }
    },
    {
      "userId": "bob@example.com",
      "tasksCreated": 15,
      "tasksMerged": 13,
      "tasksFailed": 1,
      "successRate": 92.9,
      "avgTimeToPr": 14400,
      "agentDistribution": { ... }
    },
    // ...
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "hasMore": true
  },
  "period": { ... }
}
```

---

**GET /api/stats/failures** (Recent Failures)

**Description:** List recent task failures with error details.

**Query Parameters:**
```
GET /api/stats/failures?repo=all&page=1&limit=10
```

**Response (200):**

```json
{
  "failures": [
    {
      "taskId": "507f1f77bcf86cd799439011",
      "description": "Fix payment status not updating after Stripe webhook",
      "failureReason": "GitHub API 401 — Authentication failed",
      "failedAt": "2026-02-15T14:30:00Z",
      "status": "failed",
      "errorMessage": "invalid authentication credentials",
      "githubIssueUrl": "https://github.com/mothership/finance-service/issues/123"
    },
    {
      "taskId": "507f1f77bcf86cd799439012",
      "description": "Add test coverage for payment reconciliation",
      "failureReason": "LLM timeout",
      "failedAt": "2026-02-15T12:15:00Z",
      "status": "failed",
      "errorMessage": "OpenAI API timeout after 30 seconds",
      "githubIssueUrl": null
    },
    // ...
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "hasMore": true
  }
}
```

---

**GET /api/stats/export** (CSV Export)

**Description:** Export stats to CSV format.

**Query Parameters:**
```
GET /api/stats/export?repo=all&timeRange=30d&format=csv
```

**Response (200):**
```
Content-Type: text/csv
Content-Disposition: attachment; filename=stats-2026-01-15-to-2026-02-15.csv

date,metric,value,repo,agent,unit
2026-02-08,tasksCreated,5,all,all,count
2026-02-08,tasksMerged,3,all,all,count
2026-02-08,tasksFailed,0,all,all,count
2026-02-08,successRate,100.0,all,all,percent
...
```

---

### 9.2 Error Handling

**400 Bad Request:**

```json
{
  "statusCode": 400,
  "message": "Invalid time range: from must be before to",
  "error": "BadRequestException"
}
```

**401 Unauthorized:**

```json
{
  "statusCode": 401,
  "message": "User activity endpoint requires admin role",
  "error": "UnauthorizedException"
}
```

**404 Not Found:**

```json
{
  "statusCode": 404,
  "message": "Repository not found: mothership/nonexistent",
  "error": "NotFoundException"
}
```

**500 Internal Server Error:**

```json
{
  "statusCode": 500,
  "message": "Failed to compute stats: database connection lost",
  "error": "InternalServerErrorException"
}
```

---

## 10. Frontend Changes

### 10.1 New Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/dashboard/stats` | `StatsPage` | Main stats dashboard |
| `/dashboard/stats?repo=...` | Same | With repo filter |
| `/dashboard/stats?timeRange=7d` | Same | With time range filter |

### 10.2 New Components

**Directory:** `/web/src/components/stats/`

```
stats/
├── StatsPage.tsx              # Main page container
├── StatsSidebar.tsx           # Filters (repo, time, agent, task type, user)
├── StatsGrid.tsx              # Responsive grid layout for cards
├── KpiCard.tsx                # Reusable card component (number + trend)
│
├── charts/
│   ├── StatusBreakdownChart.tsx   # Pie/donut chart
│   ├── SuccessRateChart.tsx       # Donut chart with center text
│   ├── AvgTimeChart.tsx           # Grouped bar chart
│   ├── DailyVolumeChart.tsx       # Line + area chart
│   ├── AgentUtilizationChart.tsx  # Stacked area chart
│   └── TasksByRepoChart.tsx       # Horizontal bar chart
│
├── tables/
│   ├── AgentPerformanceTable.tsx  # Sortable table
│   ├── UserActivityTable.tsx      # Paginated table (admin)
│   └── RecentFailuresTable.tsx    # Paginated failures
│
└── utils/
    ├── formatTime.ts          # Format seconds to hh:mm:ss
    ├── formatTrend.ts         # Format trend percentage
    └── colorBySuccessRate.ts  # Color-coding logic
```

### 10.3 Chart Library Selection

**Primary:** Recharts (already lightweight, good for React)

**Rationale:**
- Composable components (AreaChart, BarChart, LineChart, etc.)
- Built-in tooltips and legends
- Responsive by default
- TypeScript support
- No external dependencies (integrates with React)

**Alternative:** Chart.js (with react-chartjs-2)
- More features but heavier
- Consider if Recharts becomes limiting

### 10.4 Key Components (TypeScript)

#### StatsPage.tsx

```typescript
// src/pages/StatsPage.tsx
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatsAPI } from '../api/stats.api';
import StatsSidebar from '../components/stats/StatsSidebar';
import StatsGrid from '../components/stats/StatsGrid';
import KpiCard from '../components/stats/KpiCard';

interface StatsQuery {
  repo: string;
  agent: string;
  timeRange: string;
  from?: string;
  to?: string;
  taskType: string;
  status: string;
}

export const StatsPage: React.FC = () => {
  const [query, setQuery] = useState<StatsQuery>({
    repo: 'all',
    agent: 'all',
    timeRange: '7d',
    taskType: 'all',
    status: 'all'
  });

  // Fetch metrics
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['stats', query],
    queryFn: () => StatsAPI.getMetrics(query),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) return <div>Loading stats...</div>;
  if (error) return <div>Error loading stats</div>;

  return (
    <div className="flex gap-6 p-6">
      <StatsSidebar query={query} onQueryChange={setQuery} />

      <div className="flex-1">
        {/* KPI Cards Row */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Tasks Created"
            value={metrics.volume.tasksCreated}
            trend={metrics.trends.createdTrend}
            unit=""
          />
          <KpiCard
            label="Completion Rate"
            value={`${(metrics.volume.tasksMerged / metrics.volume.tasksDispatched * 100).toFixed(1)}%`}
            trend={metrics.trends.completionTrend}
            unit=""
          />
          <KpiCard
            label="Success Rate"
            value={`${metrics.quality.successRate.toFixed(1)}%`}
            trend={metrics.trends.successRateTrend}
            unit=""
          />
          <KpiCard
            label="Avg Time to PR"
            value={formatTime(metrics.performance.avgTimeToPr)}
            trend={metrics.trends.avgTimeToPrTrend}
            unit="seconds"
          />
        </div>

        {/* Charts Grid */}
        <StatsGrid metrics={metrics} query={query} />
      </div>
    </div>
  );
};
```

#### KpiCard.tsx

```typescript
// src/components/stats/KpiCard.tsx
interface KpiCardProps {
  label: string;
  value: string | number;
  trend?: number;        // Percentage change
  unit?: string;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, trend, unit, onClick }) => {
  const trendColor = trend ? (trend > 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-500';
  const trendIcon = trend ? (trend > 0 ? '↑' : '↓') : '→';

  return (
    <div className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg" onClick={onClick}>
      <h3 className="text-sm font-medium text-gray-600">{label}</h3>
      <div className="mt-2">
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {trend !== undefined && (
          <p className={`text-sm mt-2 ${trendColor}`}>
            {trendIcon} {Math.abs(trend).toFixed(1)}% from last period
          </p>
        )}
      </div>
    </div>
  );
};
```

#### DailyVolumeChart.tsx

```typescript
// src/components/stats/charts/DailyVolumeChart.tsx
import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface DailyVolumeData {
  date: string;
  tasksCreated: number;
  tasksMerged: number;
  tasksFailed: number;
}

export const DailyVolumeChart: React.FC<{ data: DailyVolumeData[] }> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Area type="monotone" dataKey="tasksCreated" fill="#93c5fd" stroke="none" />
        <Line type="monotone" dataKey="tasksMerged" stroke="#10b981" strokeWidth={2} />
        <Line type="monotone" dataKey="tasksFailed" stroke="#ef4444" strokeDasharray="5 5" />
      </ComposedChart>
    </ResponsiveContainer>
  );
};
```

### 10.5 Styling

Use Tailwind CSS classes for consistency:
- Card: `bg-white p-6 rounded-lg shadow`
- Chart container: `aspect-video`
- Grid layout: `grid grid-cols-2 gap-6` (responsive)
- Colors:
  - Success: `text-green-600`, `bg-green-100`
  - Failure: `text-red-600`, `bg-red-100`
  - Neutral: `text-gray-600`, `bg-gray-100`

### 10.6 State Management

Use **React Query** (TanStack Query) for server state:

```typescript
// src/api/stats.api.ts
export class StatsAPI {
  static async getMetrics(query: StatsQuery) {
    const params = new URLSearchParams({
      repo: query.repo,
      agent: query.agent,
      timeRange: query.timeRange,
      ...(query.from && { from: query.from }),
      ...(query.to && { to: query.to }),
    });
    const resp = await fetch(`/api/stats/metrics?${params}`);
    return resp.json();
  }

  static async getDailyVolume(query: StatsQuery) {
    const params = new URLSearchParams({ repo: query.repo, timeRange: query.timeRange });
    const resp = await fetch(`/api/stats/daily-volume?${params}`);
    return resp.json();
  }

  // ... more API methods
}
```

**Refetch Interval:** 30 seconds for real-time updates
**Stale Time:** 5 minutes (avoid constant refetches)

---

## 11. Role-Based Views (RBAC)

### 11.1 Developer View

**Visible Sections:**
- KPI cards (Tasks Created, Success Rate, Avg Time to PR, Completion Rate)
- Status Breakdown pie chart
- Daily Volume line chart
- Agent Performance table (public info only — no user contact)

**Hidden Sections:**
- Tasks by User chart (admin only)
- User Activity table (admin only)
- Recent Failures list (admin only)

**Filters Available:**
- Repository
- Time Range
- Agent (read-only)
- Task Type

### 11.2 Admin View

**All Sections:**
- Everything visible to developers
- Tasks by User chart
- User Activity table with pagination
- Recent Failures list
- Export to CSV button

**Filters Available:**
- Repository
- Time Range
- Agent
- Task Type
- User (search box)

**Additional Actions:**
- Drill-down to user profile page
- Drill-down to task detail (failed tasks)
- Export filtered stats

### 11.3 Implementation

```typescript
// src/components/stats/StatsPage.tsx
const { user } = useAuth(); // from auth context

return (
  <div>
    {/* Common sections */}
    <KpiCards metrics={metrics} />
    <StatusBreakdownChart data={metrics.breakdown.byStatus} />

    {/* Admin-only sections */}
    {user.role === 'admin' && (
      <>
        <TasksByUserChart data={metrics.breakdown.byUser} />
        <UserActivityTable />
        <RecentFailuresTable />
      </>
    )}
  </div>
);
```

---

## 12. Implementation Tasks

### Phase 1: Backend — Stats Collections & APIs (1-2 days)

**Task 1.1:** Create MongoDB collections and indexes
- **Effort:** 2 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/migrations/create-stats-collections.js` (Mongoose migration)
  - `/src/migrations/create-stats-indexes.js`

**Task 1.2:** Implement `StatsService`
- **Effort:** 4 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats.module.ts`
  - `/src/stats/stats.service.ts` (core aggregation logic)
  - `/src/stats/dto/stats-query.dto.ts`
  - `/src/common/interfaces/stats.interface.ts`

**Task 1.3:** Implement `StatsController` with GET endpoints
- **Effort:** 3 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats.controller.ts`
  - Endpoints:
    - `GET /api/stats/metrics`
    - `GET /api/stats/daily-volume`
    - `GET /api/stats/agent-performance`
    - `GET /api/stats/user-activity` (admin guarded)
    - `GET /api/stats/failures`

**Task 1.4:** Implement caching layer
- **Effort:** 2 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats.cache.ts` (Node-cache wrapper)
  - `/src/common/interceptors/cache.interceptor.ts`

**Task 1.5:** Create background jobs for pre-computed stats
- **Effort:** 3 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/jobs/stats-snapshot.job.ts` (daily at 00:05 UTC)
  - `/src/jobs/agent-stats.job.ts` (every 5 minutes)
  - `/src/jobs/user-stats.job.ts` (every 10 minutes)
  - `/src/jobs/jobs.module.ts`

**Task 1.6:** Add RBAC guards to endpoints
- **Effort:** 1.5 hours
- **Owner:** Backend
- **Files Modified:**
  - `/src/stats/stats.controller.ts` (add `@UseGuards(AdminGuard)` to protected endpoints)
  - `/src/auth/guards/admin.guard.ts` (create if not exists)

---

### Phase 2: Backend — Testing (1 day)

**Task 2.1:** Unit tests for `StatsService`
- **Effort:** 4 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats.service.spec.ts`
  - Test cases:
    - `getMetrics()` with various filters
    - `getDailyVolume()` with date range
    - `getAgentPerformance()`
    - Cache hits/misses
    - Error handling (DB down, invalid params)

**Task 2.2:** Integration tests for `StatsController`
- **Effort:** 3 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats.controller.spec.ts`
  - Test cases:
    - HTTP 200 responses with valid data
    - HTTP 400 for invalid time ranges
    - HTTP 401 for admin endpoints without auth
    - Response caching behavior

---

### Phase 3: Frontend — Components & Pages (1.5 days)

**Task 3.1:** Create chart components using Recharts
- **Effort:** 4 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/components/stats/charts/StatusBreakdownChart.tsx` (pie chart)
  - `/web/src/components/stats/charts/SuccessRateChart.tsx` (donut with center text)
  - `/web/src/components/stats/charts/DailyVolumeChart.tsx` (area + line)
  - `/web/src/components/stats/charts/AgentPerformanceChart.tsx` (stacked area)
  - `/web/src/components/stats/charts/AvgTimeChart.tsx` (grouped bars)
  - `/web/src/components/stats/charts/TasksByRepoChart.tsx` (horizontal bars)

**Task 3.2:** Create KPI card component
- **Effort:** 2 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/components/stats/KpiCard.tsx`
  - `/web/src/components/stats/KpiCard.module.css` (if needed)

**Task 3.3:** Create filter sidebar component
- **Effort:** 2 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/components/stats/StatsSidebar.tsx`
  - Filters:
    - Repository selector (dropdown)
    - Time range selector (radio buttons)
    - Agent selector (multi-checkbox)
    - Task type selector (multi-checkbox)
    - User search (admin only)
    - Reset filters button

**Task 3.4:** Create table components
- **Effort:** 3 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/components/stats/tables/AgentPerformanceTable.tsx`
  - `/web/src/components/stats/tables/UserActivityTable.tsx` (with pagination, admin only)
  - `/web/src/components/stats/tables/RecentFailuresTable.tsx`

**Task 3.5:** Create main `StatsPage` component
- **Effort:** 3 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/pages/StatsPage.tsx`
  - Layout: sidebar + main content grid
  - Query state management (React Router + React Query)
  - Real-time refetch on 30s interval

---

### Phase 4: Frontend — Integration & Testing (1 day)

**Task 4.1:** API client for stats endpoints
- **Effort:** 1.5 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/api/stats.api.ts`
  - Methods:
    - `getMetrics(query: StatsQuery)`
    - `getDailyVolume(query: StatsQuery)`
    - `getAgentPerformance(query: StatsQuery)`
    - `getUserActivity(query: StatsQuery, page: number)`
    - `getFailures(query: StatsQuery, page: number)`
    - `exportCsv(query: StatsQuery)`

**Task 4.2:** React Query hooks for stats data
- **Effort:** 2 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/hooks/useStats.ts`
  - `/web/src/hooks/useStatsQuery.ts` (manage URL state)

**Task 4.3:** Frontend unit tests
- **Effort:** 3 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/src/components/stats/__tests__/KpiCard.test.tsx`
  - `/web/src/components/stats/__tests__/StatsPage.test.tsx`
  - Mock API responses using `MSW` (Mock Service Worker)

**Task 4.4:** E2E test for stats dashboard
- **Effort:** 2 hours
- **Owner:** Frontend
- **Files Created:**
  - `/web/e2e/stats.e2e.test.ts` (Playwright or Cypress)
  - Test scenarios:
    - Load stats page
    - Filter by repo
    - Filter by time range
    - Export CSV
    - User-activity table (admin only)

---

### Phase 5: CSV Export & Refinements (0.5 day)

**Task 5.1:** Implement CSV export endpoint
- **Effort:** 2 hours
- **Owner:** Backend
- **Files Created:**
  - `/src/stats/stats-export.service.ts`
  - `/src/stats/stats.controller.ts` (add `GET /api/stats/export` endpoint)

**Task 5.2:** Add export button to frontend
- **Effort:** 1 hour
- **Owner:** Frontend
- **Files Modified:**
  - `/web/src/pages/StatsPage.tsx` (add export button with download logic)

**Task 5.3:** Polish and accessibility
- **Effort:** 1.5 hours
- **Owner:** Frontend & Backend
- **Fixes:**
  - Ensure charts are accessible (alt text, keyboard navigation)
  - Mobile responsiveness (test on iPhone/iPad)
  - Error messages (user-friendly)
  - Loading states (spinners, skeleton screens)

---

### Phase 6: Deployment & Monitoring (0.5 day)

**Task 6.1:** Update Railway environment variables
- **Effort:** 0.5 hour
- **Owner:** DevOps
- **Changes:**
  - No new secrets required
  - Add optional `STATS_CACHE_TTL` (5 minutes default)
  - Add optional `STATS_JOB_ENABLED` (true by default)

**Task 6.2:** Add monitoring and alerts
- **Effort:** 1 hour
- **Owner:** DevOps
- **Monitoring:**
  - Track `/api/stats/*` endpoint response times
  - Alert if response time > 2 seconds
  - Alert if stats job fails

**Task 6.3:** Documentation
- **Effort:** 1 hour
- **Owner:** Backend & Frontend
- **Files Created:**
  - `/docs/STATS-DASHBOARD.md` (user guide)
  - `/docs/STATS-API.md` (API reference for integrations)

---

### Summary Table

| Phase | Component | Effort | Owner | Duration |
|-------|-----------|--------|-------|----------|
| 1 | Backend: Collections, APIs, Caching, Jobs | 15 hrs | Backend | 2 days |
| 2 | Backend: Testing | 7 hrs | Backend | 1 day |
| 3 | Frontend: Components & Pages | 14 hrs | Frontend | 1.5 days |
| 4 | Frontend: Integration & Testing | 8 hrs | Frontend | 1 day |
| 5 | CSV Export & Polish | 4 hrs | Both | 0.5 day |
| 6 | Deployment & Monitoring | 2.5 hrs | DevOps | 0.5 day |
| **Total** | | **50.5 hrs** | **Team** | **~1 week (2 devs)** |

---

## 13. Estimated Complexity

### Backend Components

| Component | Complexity | Reasoning |
|-----------|-----------|-----------|
| **Mongoose Schemas** (stats_snapshots, agent_stats, user_stats) | Low | Straightforward schema definitions, similar to existing Task schema |
| **StatsService** (aggregation logic) | Medium | MongoDB aggregation pipelines required, must handle complex queries, timeRange filtering |
| **Caching Layer** | Low | Standard Node-cache implementation, straightforward TTL management |
| **Background Jobs** | Medium | Job scheduling (cron or Bull), MongoDB bulk inserts, error handling |
| **StatsController** | Low | REST endpoints with DTOs and validation, error handling |
| **RBAC Guards** | Low | Extend existing auth guards, simple role checks |
| **CSV Export** | Low | Stream CSV data, no complex logic |
| **Tests** | Medium | Mock database, test aggregation logic, test caching behavior |

**Overall Backend Complexity: Medium**

---

### Frontend Components

| Component | Complexity | Reasoning |
|-----------|-----------|-----------|
| **Recharts Charts** | Low | Library abstracts complexity, configuration is simple |
| **KPI Cards** | Low | Simple data display with formatting |
| **Filter Sidebar** | Low | Basic form controls with URL state management |
| **Tables** | Low | Data display with sorting/pagination |
| **Main Page** | Low | Layout and composition of smaller components |
| **React Query Integration** | Low | Hook-based API integration, built-in caching |
| **Tests** | Medium | Mock API responses, test user interactions, test URL state |

**Overall Frontend Complexity: Low**

---

### Critical Paths (Blocking Dependencies)

1. **Mongoose collections must exist** before `StatsService` can write to them
2. **Background jobs must be created** before pre-computed stats are available
3. **API endpoints must be tested** before frontend can call them reliably
4. **Cache layer must be in place** before frontend loads (to avoid slow initial load)

**Risk Level: Low** — All components are independent, can be developed in parallel with integration at the end.

---

## 14. Success Metrics

### Technical KPIs

| Metric | Target | Threshold |
|--------|--------|-----------|
| **Page Load Time** | < 2 seconds | 3 seconds (acceptable) |
| **API Response Time** | < 100 ms (cached), < 500 ms (fresh) | 1000 ms (fail) |
| **Chart Render Time** | < 500 ms | 1000 ms (fail) |
| **Cache Hit Rate** | > 80% | < 50% (fail) |
| **Test Coverage** | > 80% | < 60% (fail) |
| **Uptime** | 99.9% | < 99.5% (alert) |

### User-Facing KPIs

| Metric | Target | Period |
|--------|--------|--------|
| **Monthly Active Users** | +50% from baseline | 30 days |
| **Feature Usage Rate** | > 40% of org | After launch |
| **Time Spent on Stats Page** | > 2 minutes per session | Baseline after 1 month |
| **Filter Usage** | > 70% of sessions | After launch |
| **Export Downloads** | > 10 per week | Baseline after 1 month |

---

## Appendix A: MongoDB Aggregation Examples

### Example: Daily Task Counts

```javascript
db.tasks.aggregate([
  {
    $match: {
      createdAt: {
        $gte: ISODate("2026-02-08"),
        $lt: ISODate("2026-02-15")
      }
    }
  },
  {
    $group: {
      _id: {
        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
      },
      tasksCreated: { $sum: 1 },
      tasksMerged: {
        $sum: { $cond: [{ $eq: ["$status", "merged"] }, 1, 0] }
      },
      tasksFailed: {
        $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
      }
    }
  },
  {
    $sort: { _id: 1 }
  }
])
```

### Example: Agent Performance

```javascript
db.tasks.aggregate([
  {
    $match: {
      status: { $in: ["merged", "failed"] },
      completedAt: {
        $gte: ISODate("2026-02-08"),
        $lt: ISODate("2026-02-15")
      }
    }
  },
  {
    $group: {
      _id: "$recommendedAgent",
      totalTasks: { $sum: 1 },
      mergedCount: {
        $sum: { $cond: [{ $eq: ["$status", "merged"] }, 1, 0] }
      },
      failedCount: {
        $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] }
      },
      avgTimeToPr: {
        $avg: {
          $subtract: ["$dispatchedAt", "$createdAt"]
        }
      }
    }
  },
  {
    $addFields: {
      successRate: {
        $multiply: [
          { $divide: ["$mergedCount", "$totalTasks"] },
          100
        ]
      }
    }
  },
  {
    $sort: { successRate: -1 }
  }
])
```

---

## Appendix B: Chart.js vs Recharts Comparison

| Aspect | Recharts | Chart.js |
|--------|----------|----------|
| **Bundle Size** | ~60 KB | ~35 KB (lighter) |
| **React Integration** | Native (components) | Via wrapper (react-chartjs-2) |
| **Learning Curve** | Shallow (component-based) | Moderate (canvas config) |
| **Customization** | Good (props-based) | Very Good (canvas control) |
| **Type Safety** | Excellent (TypeScript) | Good |
| **Accessibility** | Built-in alt text, ARIA | Requires custom setup |
| **Real-Time Updates** | Excellent | Good |
| **Animations** | Good | Excellent |
| **Mobile Responsive** | Yes | Requires config |
| **Recommendation** | **Preferred for MVP** | Consider for v2 if more control needed |

---

## Appendix C: Sample Test Cases

### Backend: StatsService.getMetrics()

```typescript
describe('StatsService.getMetrics', () => {
  it('should return metrics for the last 7 days', async () => {
    const query: StatsQuery = { repo: 'all', agent: 'all', timeRange: '7d' };
    const result = await service.getMetrics(query);

    expect(result.period.label).toBe('Last 7 days');
    expect(result.volume.tasksCreated).toBeGreaterThanOrEqual(0);
    expect(result.quality.successRate).toBeLessThanOrEqual(100);
  });

  it('should filter metrics by repository', async () => {
    const query: StatsQuery = {
      repo: 'mothership/finance-service',
      agent: 'all',
      timeRange: '7d'
    };
    const result = await service.getMetrics(query);

    expect(result.filters.repo).toBe('mothership/finance-service');
    // Verify only finance-service tasks are counted
  });

  it('should throw on invalid time range', async () => {
    const query: StatsQuery = {
      repo: 'all',
      agent: 'all',
      timeRange: 'invalid'
    };

    await expect(service.getMetrics(query)).rejects.toThrow();
  });

  it('should return cached result on second call', async () => {
    const query: StatsQuery = { repo: 'all', agent: 'all', timeRange: '7d' };

    const first = await service.getMetrics(query);
    const second = await service.getMetrics(query);

    expect(first).toEqual(second);
    // Verify DB was queried only once
    expect(mockDatabase.queries).toHaveBeenCalledTimes(1);
  });
});
```

### Frontend: StatsPage Integration Test

```typescript
describe('StatsPage', () => {
  it('should render KPI cards with metrics', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Tasks Created')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('should filter metrics by repository', async () => {
    render(<StatsPage />);

    const repoSelect = screen.getByLabelText('Repository');
    await userEvent.selectOption(repoSelect, 'mothership/finance-service');

    await waitFor(() => {
      expect(mockApi.getMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'mothership/finance-service' })
      );
    });
  });

  it('should update URL when filter changes', async () => {
    render(<StatsPage />);

    const timeSelect = screen.getByLabelText('Time Range');
    await userEvent.selectOption(timeSelect, '30d');

    expect(window.location.search).toContain('timeRange=30d');
  });

  it('should respect admin-only visibility', async () => {
    const { rerender } = render(<StatsPage />, { user: { role: 'developer' } });

    expect(screen.queryByText('Tasks by User')).not.toBeInTheDocument();

    rerender(<StatsPage />, { user: { role: 'admin' } });

    expect(screen.getByText('Tasks by User')).toBeInTheDocument();
  });
});
```

---

## Appendix D: Security Considerations

### Data Privacy

1. **User Activity** — Admin endpoint only (role-guarded)
   - Non-admins cannot see task counts per user
   - Admins can only see aggregates within mothership org

2. **Task Details** — Filtered by repo access
   - User can see stats only for repos they have access to
   - Future: integrate with GitHub org membership for fine-grained control

3. **Error Messages** — Sanitized
   - Don't expose DB field names or internal error details
   - Return user-friendly error messages

### Injection Prevention

1. **Repository Name** — Validate against list of mothership/* repos
2. **Agent Name** — Validate against enum (claude-code, codex, copilot)
3. **Time Range** — Validate against predefined options or date format
4. **CSV Export** — Sanitize values (remove quotes, newlines) to prevent injection

### Rate Limiting

- `/api/stats/*` — 60 requests per minute per user
- `/api/stats/export` — 5 exports per hour per user

---

## Appendix E: Future Enhancements (V2.0)

1. **Cost Tracking** — Show API costs per agent
2. **Custom Time Series** — More granular aggregation (hourly, 5-minute)
3. **Anomaly Detection** — Flag unusual trends (ML-based)
4. **Predictive Analytics** — Forecast future task volume
5. **Webhooks** — Notify Slack/email on stats milestones
6. **Drill-Down Dashboard** — Multi-level navigation from stats to tasks to PRs
7. **Reporting** — Scheduled email reports (daily, weekly, monthly)
8. **Data Retention Policies** — Automatic archival of old snapshots
9. **Custom Metrics** — Let admins define metrics via UI
10. **Real-Time Collaboration** — Multiple users viewing same dashboard with shared filters

---

## Sign-Off

**Specification Version:** 1.0
**Last Updated:** February 15, 2026
**Status:** Ready for Implementation
**Estimated Effort:** 50 hours (2 developers, ~1 week)
**Estimated Complexity:** Medium
**High-Risk Areas:** MongoDB aggregation pipeline performance, chart rendering with large datasets

---

**Document prepared for:** AI Pipeline Development Team
**Review Status:** Ready for agent team review before implementation kickoff
