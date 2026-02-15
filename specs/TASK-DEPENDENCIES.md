# Task Dependencies Feature — Specification

**Version:** 1.0
**Status:** Draft
**Last Updated:** February 15, 2026
**Author:** Architecture Team
**Scope:** AI Pipeline v2.1+

---

## 1. Overview

The Task Dependencies feature enables task creators to express that a coding task cannot begin until one or more conditions are met. This solves the problem of **task sequencing and orchestration** — ensuring that tasks run in the correct order and that dependent tasks are automatically notified or started when their dependencies resolve.

### Problem Statement

In a complex codebase, many tasks are interdependent:
- A feature task cannot start until a foundational bugfix is merged
- A test suite refactor must wait for the core API migration to complete
- A documentation task should start once a feature PR is reviewed, not necessarily merged
- Multiple tasks may depend on the same external system (e.g., a Stripe API integration)

Without dependency tracking, teams must manually coordinate via comments, Slack, or emails. This is error-prone, scales poorly, and creates a poor developer experience.

### Solution

A **task dependency graph** that:
1. Allows tasks to declare what they depend on (other tasks, PRs, external issues)
2. Automatically tracks dependency state (pending, ready, blocked, failed)
3. Provides visual feedback in the UI (dependency graph, status indicators)
4. Triggers automatic actions when dependencies resolve (start task, send notification)
5. Prevents circular dependencies (A→B→A is invalid)
6. Integrates with GitHub webhooks to detect when PRs merge or issues close

---

## 2. User Stories

### Story 1: Create a Task with Dependencies
**As a** product manager
**I want to** create a task that depends on another task being completed
**So that** the AI agent knows not to start until the dependency is resolved

**Acceptance Criteria:**
- Task form shows "Add Dependencies" button
- Can select other tasks from a dropdown/search
- Can specify multiple dependencies
- Can choose dependency type (task, PR, issue)
- Validation prevents adding a task as a dependency of itself

### Story 2: View Task Status with Dependency Info
**As a** developer
**I want to** see at a glance if a task is blocked by dependencies
**So that** I know why a task hasn't started and when it will

**Acceptance Criteria:**
- Task detail page shows "Dependencies" section
- Lists all dependencies with current state (pending, ready, blocked, failed)
- Shows the dependency that is blocking (if any)
- Provides a "Dependency Graph" visualization option
- Shows estimated time until task can start

### Story 3: Get Notified When Dependency Resolves
**As a** task creator
**I want to** be notified when a blocking dependency is resolved
**So that** I know my task is now ready to start

**Acceptance Criteria:**
- Web UI notification when dependency resolves
- Slack notification if task was created via Slack
- Email notification (optional, for v2)
- Notification links to the unblocked task

### Story 4: Watch GitHub PR Merge as Dependency
**As a** a developer
**I want to** create a task that depends on "PR #42 being merged"
**So that** my task automatically starts when the PR lands in main

**Acceptance Criteria:**
- Can select "GitHub PR" as dependency type
- Can enter PR number (auto-filled if created from PR comment)
- Task automatically transitions to "ready" when GitHub webhook reports PR merge
- Works for PRs in the same repo or external repos

### Story 5: Prevent Circular Dependencies
**As a** system
**I want to** reject any dependency that would create a cycle (A→B→A)
**So that** tasks don't wait forever for each other

**Acceptance Criteria:**
- When adding a dependency, check for cycles (DFS traversal)
- Show error message: "Task X depends on Task Y, which depends on Task Z, which depends on Task X. Cycle detected."
- Block the dependency creation with 400 Bad Request

### Story 6: Auto-Start Task When Dependencies Resolve
**As a** an engineer
**I want to** task to automatically transition to "ready" and potentially auto-dispatch
**So that** I don't need to manually monitor or trigger it

**Acceptance Criteria:**
- When all dependencies are "ready", task transitions from "pending" to "ready"
- If task is set to "auto-start", it automatically moves to "dispatched" (creates GitHub issue)
- Can be toggled per task in the UI
- Audit log shows "auto-started by system due to dependency resolution"

### Story 7: Fail Dependent Tasks If Dependency Fails
**As a** system
**I want to** cascade failures when a dependency fails
**So that** we don't waste resources on tasks that can't possibly succeed

**Acceptance Criteria:**
- When a dependency task fails, dependent tasks transition to "blocked" status
- Notification sent: "Task X is blocked: its dependency (Task Y) failed"
- Can optionally auto-fail dependent tasks (configurable)
- Users can manually override and force the dependent task to proceed

---

## 3. Dependency Types

### 3.1 Task Dependency
A task depends on another task being completed with status `merged` or `success`.

**Definition:**
```json
{
  "type": "task",
  "taskId": "507f1f77bcf86cd799439011",
  "requiredStatus": "merged",
  "blockingBehavior": "hard"
}
```

**Valid States for Dependency Resolution:**
- `merged` — Task has successfully merged a PR (default)
- `completed` — Task reached `merged` status
- `dispatched` — Task has been dispatched (less strict)

**Examples:**
- Task A: "Implement payment module" → depends on Task B: "Create payment schema"
- Task B must reach "merged" before Task A can start

### 3.2 PR Dependency
A task depends on a specific GitHub PR being merged.

**Definition:**
```json
{
  "type": "pr",
  "repo": "mothership/finance-service",
  "prNumber": 42,
  "requiredStatus": "merged"
}
```

**Valid States:**
- `merged` — PR is merged to the base branch
- `reviewed` — PR has at least one approval (optional)
- `open` — PR is open (weak dependency)

**Examples:**
- Task: "Add invoice payment method support" → depends on PR #1234 (Stripe API integration) being merged
- Task: "Write integration tests" → depends on PR #5678 (test framework upgrade) being reviewed

### 3.3 External Issue Dependency
A task depends on an external GitHub issue being closed (often in a different repo).

**Definition:**
```json
{
  "type": "external_issue",
  "repo": "mothership/platform",
  "issueNumber": 999,
  "requiredStatus": "closed"
}
```

**Valid States:**
- `closed` — Issue is closed (not necessarily by our code)
- `resolved` — Issue has a "resolved" label
- `any_update` — Wait for any activity on the issue

**Examples:**
- Task: "Implement feature X" → depends on external platform team closing Issue #999
- Task: "Migrate to new API" → depends on mothership/core closing Issue #888 (API v2 launch)

### 3.4 Blocked By / Blocks Relationship
Some dependencies are "soft" — they're advisory but don't prevent task dispatch.

**Definition:**
```json
{
  "type": "task",
  "taskId": "507f1f77bcf86cd799439012",
  "requiredStatus": "dispatched",
  "blockingBehavior": "soft"
}
```

**Hard Blocking (default):** Task cannot start until dependency is met
**Soft Blocking:** Task CAN start, but is marked as "has blocker" for visibility

---

## 4. Dependency States

### State Machine for Dependencies

```
                    ┌─────────────────┐
                    │     PENDING     │
                    │ (waiting for    │
                    │  dependency)    │
                    └────────┬────────┘
                             │
                    [dependency resolves]
                             │
                             ▼
                    ┌─────────────────┐
                    │      READY      │
                    │ (all deps met)  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
        [task starts]                [task not taken]
              │                             │
              ▼                             ▼
        ┌──────────────┐             ┌──────────────┐
        │   ACTIVE     │             │   EXPIRED    │
        │              │             │              │
        └──────────────┘             └──────────────┘

                    ┌─────────────────┐
                    │    BLOCKED      │
                    │ (dependency     │
                    │  failed/failed) │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
        [override]                   [wait for retry]
              │                             │
              ▼                             ▼
        ┌──────────────┐             ┌──────────────┐
        │  OVERRIDDEN  │             │   RETRYING   │
        │              │             │              │
        └──────────────┘             └──────────────┘
```

### State Descriptions

| State | Description | Trigger | Next State |
|-------|-------------|---------|-----------|
| **PENDING** | Dependency not yet resolved | Task created with dependency | READY or BLOCKED |
| **READY** | Dependency resolved, task can proceed | All dependencies resolve | ACTIVE or EXPIRED |
| **ACTIVE** | Task has started (is in coding/pr_open) | Task dispatched/coding | N/A |
| **BLOCKED** | Dependency failed or is broken | Dependency transitioned to failed | OVERRIDDEN or RETRYING |
| **EXPIRED** | Task was not dispatched within TTL | No activity for 7 days | N/A |
| **OVERRIDDEN** | User bypassed the dependency | User clicks "override" | ACTIVE |
| **RETRYING** | Dependency is being retried | Dependency retried | READY or BLOCKED |

### Per-Task Dependency State

Each task has a composite state based on its dependencies:

```
TaskDependencyState {
  overallState: "pending" | "ready" | "blocked" | "active" | "expired" | "overridden"
  dependencies: Dependency[] {
    id: string
    type: "task" | "pr" | "external_issue"
    state: "pending" | "ready" | "blocked" | "resolved"
    blockingBehavior: "hard" | "soft"
    resolvedAt?: Date
    failureReason?: string
  }
  blockingDependencies: Dependency[]  // Only hard-blocking, unresolved
  softBlockingDependencies: Dependency[] // Only soft-blocking, unresolved
  canStart: boolean  // true if no hard-blocking dependencies
  readyAt?: Date
}
```

---

## 5. UI/UX Design

### 5.1 Creating a Task with Dependencies

**Location:** Task creation form (Web UI + Slack command)

**Flow:**

1. User clicks "New Task" button
2. Form opens with standard fields (description, repo, files, criteria)
3. Below criteria, show "Task Dependencies" section with:
   - "Add Dependency" button
   - Empty state: "No dependencies yet"

4. User clicks "Add Dependency" → Modal opens:
   ```
   ┌─────────────────────────────────────────┐
   │     Add Task Dependency                 │
   ├─────────────────────────────────────────┤
   │                                         │
   │ Dependency Type:                        │
   │  ○ Task in this system                  │
   │  ○ GitHub PR                            │
   │  ○ External Issue                       │
   │                                         │
   │ [If Task selected]                      │
   │ Select Task:                            │
   │ [ Search tasks... ↓]                    │
   │ • Task 1: "Implement auth flow"         │
   │ • Task 2: "Setup database"              │
   │                                         │
   │ Blocking Behavior:                      │
   │  ○ Hard (task won't start)              │
   │  ○ Soft (advisory only)                 │
   │                                         │
   │ Auto-start when resolved?               │
   │ ☐ Yes                                   │
   │                                         │
   │        [Add] [Cancel]                   │
   └─────────────────────────────────────────┘
   ```

5. User selects dependency, clicks "Add"
6. Dependency appears in list:
   ```
   Dependencies:
   ✓ Task: "Implement auth flow" (Task #123)
     - Type: Hard blocking
     - Status: Pending (waiting)
     - [Remove]
   ```

7. User can add more or submit task

**For Slack Command:**
```
/ai-task Create dashboard for user analytics
  --depends-on <task-id>
  --depends-on-pr mothership/finance-service#42
```

### 5.2 Viewing Task Detail with Dependencies

**Location:** Task detail page `/tasks/:id`

**Section: Dependencies**

```
┌─────────────────────────────────────────────────────────┐
│ Dependencies                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ⚠️ Status: BLOCKED (1 hard dependency unresolved)      │
│                                                         │
│ Hard Blockers (must resolve to proceed):               │
│  [❌] Task #123: "Implement auth flow"                 │
│       Status: CODING (in progress)                     │
│       Est. completion: 2 hours                         │
│       └─ Last update: 30 min ago                       │
│                                                         │
│  [✓] PR #42: "Add payment webhook"                     │
│       Status: MERGED                                   │
│       Merged: Feb 15, 10:00 AM                         │
│                                                         │
│ Soft Blockers (advisory):                              │
│  [⏳] Issue mothership/platform#999: "API v2 launch"   │
│       Status: OPEN                                     │
│       Last updated: Feb 14                             │
│                                                         │
│ [View Dependency Graph] [Override Dependencies]        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Icons:**
- ✓ Green checkmark = dependency resolved
- ❌ Red X = dependency failed/blocked
- ⏳ Hourglass = dependency pending
- ⚠️ Warning = task is blocked
- ℹ️ Info = soft blocker

### 5.3 Dependency Graph Visualization

**Location:** Modal accessed from task detail or dashboard

**Visualization:** Interactive dependency graph using D3.js or similar

```
                    ┌──────────────────┐
                    │  Task #999       │
                    │ "Build report"   │
                    │ [PENDING]        │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Task #123       │
                    │ "Setup DB"       │
                    │ [CODING]         │
                    │ 30% complete     │
                    └────────┬─────────┘
                             │
                ┌────────────┴─────────────┐
                │                          │
        ┌───────▼────────┐        ┌───────▼────────┐
        │  Task #456     │        │  PR #42        │
        │ "Migrate data" │        │ "Add payments" │
        │ [DISPATCHED]   │        │ [MERGED]       │
        └────────────────┘        └────────────────┘
```

**Features:**
- Click node to open task detail
- Hover node to see status details
- Color-coded by state (green=ready, red=blocked, yellow=pending, gray=active)
- Zoom and pan support
- Export as image/PDF

### 5.4 Dashboard Changes

**Add "Dependency Status" Filter:**

```
Filters:
☐ Show all
☐ Blocked by dependencies
☐ Has dependencies
☐ All dependencies resolved
```

**Add Column to Task List:**

```
| Task | Status | Dependencies | Last Updated |
|------|--------|--------------|--------------|
| #123 | CODING | ⏳ 1/3 ready | 30 min ago   |
| #999 | PENDING| ❌ BLOCKED   | 2 hours ago  |
| #456 | READY  | ✓ All ready  | Just now     |
```

---

## 6. Automatic Actions

### 6.1 Auto-Start Task When Dependencies Resolve

**When:** All hard dependencies reach "ready" state
**Action:** Task transitions from "pending" → "ready"
**Optional:** If "auto-start" is enabled, task transitions to "dispatched" (creates GitHub issue)

**Workflow:**

```
Time: 10:00 AM
Task #999 created with dependency on Task #123
Task #999 status: PENDING
Task #123 status: CODING

Time: 10:30 AM
Task #123 reaches MERGED status
→ GitHub webhook triggers: pr-merged event
→ System checks dependents of Task #123
→ Task #999 dependency resolves
→ Task #999 transitions: PENDING → READY
→ If auto-start enabled: READY → DISPATCHED
→ Notification sent: "Task #999 is ready to start"
```

**Implementation:**
```typescript
// In tasks.service.ts
async onDependencyResolved(taskId: string): Promise<void> {
  const task = await this.taskModel.findById(taskId);
  const dependencyState = await this.checkDependencies(taskId);

  if (dependencyState.canStart && task.autoStartOnDependency) {
    // Dispatch the task (create GitHub issue)
    await this.dispatchTask(taskId);
  } else if (dependencyState.canStart) {
    // Transition to READY
    await this.updateStatus(taskId, TaskStatus.READY);
    await this.notifyTaskReady(taskId);
  }
}
```

### 6.2 Auto-Fail Dependent Tasks If Dependency Fails

**When:** A dependency transitions to "failed" state
**Action (Configurable):**
1. Mark dependents as "blocked" (default, safe)
2. Optionally auto-fail dependents (if `autoFailOnDependencyFailure: true`)

**Notification:** "Task #456 is blocked: dependency (Task #123) failed. Reason: [error message]"

**Example:**

```
Task #123: "Implement auth flow" → FAILED
  └─ Error: "Database migration failed"

Task #999: "Build dashboard"
  └─ was READY, now BLOCKED
  └─ Notification: "Task #999 is blocked: its dependency (Task #123) failed"
```

### 6.3 Notifications When Blocked/Unblocked

**Notification Types:**

| Event | Channel | Message |
|-------|---------|---------|
| Dependency blocked | Web + Slack | "Task #999 is blocked: dependency (Task #123) failed" |
| Dependency resolved | Web + Slack | "Task #999 is ready! All dependencies resolved." |
| Dependency partially ready | Web | "Task #999: 2 of 3 dependencies resolved (est. 1 hour)" |
| Task auto-started | Web + Slack | "Task #999 auto-started: all dependencies resolved" |
| Override applied | Web | "Task #456 override applied. Proceeding despite blocked status" |

**Example Slack Notification:**

```
⚠️ Task #999 is blocked
Dependency not met: Task #123 "Implement auth flow"
Status: FAILED (Database migration failed)

When fixed, Task #999 will automatically start.
[View Task] [View Dependency]
```

---

## 7. Circular Dependency Detection

### 7.1 Algorithm

When adding a dependency (task A depends on task B), perform a depth-first search (DFS):

```
1. Start from task B
2. Traverse all tasks that depend on B
3. If we encounter task A during traversal → CYCLE DETECTED
4. Reject the dependency with 400 Bad Request
```

**Implementation:**

```typescript
async detectCycle(
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  const visited = new Set<string>();

  const hasCycle = async (currentId: string): Promise<boolean> => {
    if (currentId === taskId) return true; // Found the cycle!
    if (visited.has(currentId)) return false; // Already checked

    visited.add(currentId);

    // Find all tasks that depend on currentId
    const dependents = await this.taskModel.find({
      dependencies: { $elemMatch: { taskId: currentId } }
    });

    for (const dependent of dependents) {
      if (await hasCycle(dependent._id.toString())) {
        return true;
      }
    }

    return false;
  };

  return hasCycle(dependsOnTaskId);
}
```

### 7.2 Error Handling

**Request:**
```
POST /api/tasks/507f1f77bcf86cd799439011/dependencies
{
  "type": "task",
  "taskId": "507f1f77bcf86cd799439012"
}
```

**Response (400):**
```json
{
  "statusCode": 400,
  "error": "Circular Dependency",
  "message": "Cannot create dependency: Task A depends on Task B, which depends on Task C, which depends on Task A. Cycle detected.",
  "cycle": ["A", "B", "C", "A"]
}
```

---

## 8. Database Changes

### 8.1 Task Schema Updates

**File:** `/src/common/schemas/task.schema.ts`

**New Fields:**

```typescript
@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  // ... existing fields ...

  // Dependencies (new)
  @Prop({
    type: [
      {
        id: { type: String, default: () => new ObjectId() },
        type: { type: String, enum: ['task', 'pr', 'external_issue'] },

        // Task dependency
        taskId?: String,

        // PR dependency
        repo?: String,
        prNumber?: Number,

        // External issue dependency
        externalRepo?: String,
        externalIssueNumber?: Number,

        // Common
        requiredStatus: String, // 'merged', 'completed', 'closed', etc.
        blockingBehavior: { type: String, enum: ['hard', 'soft'], default: 'hard' },
        currentState: { type: String, enum: ['pending', 'ready', 'blocked', 'resolved', 'failed'], default: 'pending' },

        // Metadata
        resolvedAt?: Date,
        failureReason?: String,
      },
    ],
    default: [],
  })
  dependencies: Array<{
    id: string;
    type: 'task' | 'pr' | 'external_issue';
    taskId?: string;
    repo?: string;
    prNumber?: number;
    externalRepo?: string;
    externalIssueNumber?: number;
    requiredStatus: string;
    blockingBehavior: 'hard' | 'soft';
    currentState: 'pending' | 'ready' | 'blocked' | 'resolved' | 'failed';
    resolvedAt?: Date;
    failureReason?: string;
  }>;

  @Prop({ default: 'pending' })
  dependencyState: 'pending' | 'ready' | 'blocked' | 'active' | 'expired' | 'overridden';

  @Prop({ default: false })
  autoStartOnDependency: boolean;

  @Prop({ default: false })
  autoFailOnDependencyFailure: boolean;

  @Prop({ default: null })
  dependencyResolvedAt?: Date;
}
```

### 8.2 Indexes

```typescript
// In TaskSchema
TaskSchema.index({ 'dependencies.taskId': 1 }, { sparse: true });
TaskSchema.index({ 'dependencies.prNumber': 1 }, { sparse: true });
TaskSchema.index({ 'dependencies.externalIssueNumber': 1 }, { sparse: true });
TaskSchema.index({ dependencyState: 1 });
```

### 8.3 New Collections (Optional for Complex Cases)

**DependencyEdge Collection** (alternative to embedded, for large graphs):

```
{
  _id: ObjectId,
  sourceTaskId: ObjectId,
  dependsOnTaskId: ObjectId,
  dependsOnPrNumber: Number,
  dependsOnRepo: String,
  requiredStatus: String,
  blockingBehavior: String,
  currentState: String,
  createdAt: Date,
  resolvedAt: Date,
}
```

**Index:** `{ sourceTaskId: 1, dependsOnTaskId: 1 }` for fast lookups

**Recommendation:** Start with embedded for MVP (simpler), migrate to separate collection if dependency graphs become very large (>100 dependencies per task).

---

## 9. API Endpoints

### 9.1 Dependency Management

#### POST /api/tasks/:id/dependencies
**Add a dependency to a task**

**Request:**
```json
{
  "type": "task",
  "taskId": "507f1f77bcf86cd799439012",
  "blockingBehavior": "hard",
  "requiredStatus": "merged",
  "autoStart": true
}
```

**Response (201):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "status": "pending",
  "dependencyState": "pending",
  "dependencies": [
    {
      "id": "dep-123",
      "type": "task",
      "taskId": "507f1f77bcf86cd799439012",
      "requiredStatus": "merged",
      "blockingBehavior": "hard",
      "currentState": "pending"
    }
  ]
}
```

**Errors:**
- 400: Circular dependency detected
- 400: Task not found
- 400: Invalid dependency type
- 409: Dependency already exists

#### DELETE /api/tasks/:id/dependencies/:depId
**Remove a dependency**

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "dependencies": []
}
```

#### GET /api/tasks/:id/dependencies
**List all dependencies of a task**

**Response (200):**
```json
{
  "taskId": "507f1f77bcf86cd799439011",
  "dependencyState": "pending",
  "dependencies": [
    {
      "id": "dep-123",
      "type": "task",
      "taskId": "507f1f77bcf86cd799439012",
      "title": "Implement auth flow",
      "currentStatus": "coding",
      "requiredStatus": "merged",
      "blockingBehavior": "hard",
      "currentState": "pending",
      "estimatedCompletion": "2026-02-16T10:00:00Z"
    }
  ],
  "canStart": false,
  "blockedBy": ["dep-123"]
}
```

### 9.2 Dependency Graph

#### GET /api/tasks/:id/dependency-graph
**Get full dependency graph (for visualization)**

**Response (200):**
```json
{
  "nodes": [
    {
      "id": "task-123",
      "label": "Implement auth flow",
      "type": "task",
      "status": "coding",
      "dependencyState": "active",
      "x": 100,
      "y": 100
    },
    {
      "id": "task-999",
      "label": "Build dashboard",
      "type": "task",
      "status": "pending",
      "dependencyState": "pending",
      "x": 300,
      "y": 100
    },
    {
      "id": "pr-42",
      "label": "PR #42: Add payments",
      "type": "pr",
      "status": "merged",
      "dependencyState": "resolved",
      "x": 200,
      "y": 200
    }
  ],
  "edges": [
    {
      "source": "task-999",
      "target": "task-123",
      "blockingBehavior": "hard",
      "currentState": "pending"
    },
    {
      "source": "task-999",
      "target": "pr-42",
      "blockingBehavior": "soft",
      "currentState": "resolved"
    }
  ]
}
```

### 9.3 Dependency Query/Filter

#### GET /api/tasks?dependencyState=blocked
**Filter tasks by dependency state**

**Query Parameters:**
- `dependencyState`: pending | ready | blocked | active | expired | overridden
- `hasBlockers`: true | false
- `waitingFor`: <taskId> (show tasks waiting for a specific task)

**Response (200):**
```json
{
  "tasks": [
    {
      "id": "507f1f77bcf86cd799439011",
      "status": "pending",
      "dependencyState": "blocked",
      "dependencies": [...],
      "blockedBy": ["dep-456"]
    }
  ],
  "total": 1,
  "page": 1
}
```

### 9.4 Override Dependencies

#### POST /api/tasks/:id/override-dependencies
**Force a task to start despite unresolved dependencies**

**Request:**
```json
{
  "reason": "Emergency: need to ship this now"
}
```

**Response (200):**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "status": "ready",
  "dependencyState": "overridden",
  "event": {
    "eventType": "dependency_override",
    "reason": "Emergency: need to ship this now",
    "createdAt": "2026-02-15T10:00:00Z",
    "createdBy": "user@example.com"
  }
}
```

### 9.5 Webhook: GitHub PR Merged

#### POST /api/webhooks/github
**GitHub webhook (existing endpoint)**

**Enhancement:** Add logic to check if PR merge resolves any task dependencies

```typescript
// In github.service.ts
async handlePrMerged(repo: string, prNumber: number): Promise<void> {
  // Find all tasks with PR dependency
  const dependentTasks = await this.taskModel.find({
    dependencies: {
      $elemMatch: {
        type: 'pr',
        repo: repo,
        prNumber: prNumber,
      },
    },
  });

  // Update dependency state for each
  for (const task of dependentTasks) {
    const depId = task.dependencies.find(
      d => d.type === 'pr' && d.prNumber === prNumber,
    ).id;

    await this.updateDependencyState(task._id.toString(), depId, 'resolved');
    await this.checkAndTransitionTask(task._id.toString());
    await this.notifyDependencyResolved(task._id.toString());
  }
}
```

---

## 10. Frontend Changes

### 10.1 New Components (React)

**File Structure:**
```
web/src/components/
  TaskDependencies/
    AddDependencyModal.tsx
    DependencyList.tsx
    DependencyGraph.tsx
    DependencyStatus.tsx
  TaskForm/
    DependenciesSection.tsx  (new section)
  TaskDetail/
    DependenciesPanel.tsx    (new panel)
```

### 10.2 AddDependencyModal Component

```typescript
interface AddDependencyModalProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onAdd: (dependency: DependencyInput) => Promise<void>;
}

export const AddDependencyModal: React.FC<AddDependencyModalProps> = ({
  taskId,
  open,
  onClose,
  onAdd,
}) => {
  const [type, setType] = useState<'task' | 'pr' | 'external_issue'>('task');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [blockingBehavior, setBlockingBehavior] = useState<'hard' | 'soft'>('hard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    try {
      setLoading(true);
      setError(null);

      if (type === 'task' && !selectedTask) {
        setError('Please select a task');
        return;
      }

      await onAdd({
        type,
        taskId: type === 'task' ? selectedTask : undefined,
        blockingBehavior,
        requiredStatus: 'merged',
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Dependency">
      {/* form content */}
    </Modal>
  );
};
```

### 10.3 DependencyGraph Component

```typescript
import { ReactFlow, Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

interface DependencyGraphProps {
  taskId: string;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({ taskId }) => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDependencyGraph(taskId)
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
      })
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) return <Spinner />;

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow nodes={nodes} edges={edges}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
};
```

### 10.4 TaskForm Enhancement

**Add to CreateTaskForm:**

```typescript
const [dependencies, setDependencies] = useState<Dependency[]>([]);
const [showAddDependencyModal, setShowAddDependencyModal] = useState(false);

const handleAddDependency = async (dep: DependencyInput) => {
  setDependencies([...dependencies, dep]);
};

const handleRemoveDependency = (depId: string) => {
  setDependencies(dependencies.filter(d => d.id !== depId));
};

return (
  <form onSubmit={handleSubmit}>
    {/* existing fields */}

    <Section title="Task Dependencies">
      <Button onClick={() => setShowAddDependencyModal(true)}>
        Add Dependency
      </Button>

      {dependencies.length > 0 && (
        <DependencyList
          dependencies={dependencies}
          onRemove={handleRemoveDependency}
        />
      )}
    </Section>

    <AddDependencyModal
      taskId="new" // or undefined
      open={showAddDependencyModal}
      onClose={() => setShowAddDependencyModal(false)}
      onAdd={handleAddDependency}
    />

    <SubmitButton>Create Task</SubmitButton>
  </form>
);
```

### 10.5 Dashboard Enhancements

**Add to TaskList filters:**

```typescript
const [dependencyFilter, setDependencyFilter] = useState<string>('all');

<FilterBar>
  <Select
    label="Dependency Status"
    value={dependencyFilter}
    onChange={setDependencyFilter}
  >
    <Option value="all">All</Option>
    <Option value="blocked">Blocked</Option>
    <Option value="pending">Pending</Option>
    <Option value="ready">Ready</Option>
    <Option value="no-deps">No dependencies</Option>
  </Select>
</FilterBar>

<TaskTable
  columns={[
    { key: 'title', label: 'Task' },
    { key: 'status', label: 'Status' },
    { key: 'dependencyState', label: 'Dependencies' },
    { key: 'createdAt', label: 'Created' },
  ]}
  rows={filteredTasks}
/>
```

---

## 11. GitHub Integration

### 11.1 Webhook Events to Handle

| Event | Source | Action |
|-------|--------|--------|
| `pull_request.closed` with merged=true | GitHub | Resolve PR dependencies |
| `pull_request.reviewed` | GitHub | Resolve soft PR dependencies (optional) |
| `issues.closed` | GitHub | Resolve external issue dependencies |
| `issues.edited` | GitHub | Re-evaluate dependencies if resolved label added |

### 11.2 PR Merge Event Handler

**File:** `/src/github/github.webhook.service.ts`

```typescript
async handlePullRequestMerged(repo: string, prNumber: number): Promise<void> {
  console.log(`PR merged: ${repo}#${prNumber}`);

  // Find all tasks with this PR as a dependency
  const dependentTasks = await this.taskModel.find({
    dependencies: {
      $elemMatch: {
        type: 'pr',
        repo: repo,
        prNumber: prNumber,
        requiredStatus: 'merged',
      },
    },
  });

  console.log(`Found ${dependentTasks.length} dependent tasks`);

  for (const task of dependentTasks) {
    const dependency = task.dependencies.find(
      d => d.type === 'pr' && d.prNumber === prNumber,
    );

    if (!dependency) continue;

    // Update dependency
    await this.taskModel.findByIdAndUpdate(task._id, {
      $set: {
        'dependencies.$[elem].currentState': 'resolved',
        'dependencies.$[elem].resolvedAt': new Date(),
      },
      arrayFilters: [{ 'elem.id': dependency.id }],
    });

    // Check if all hard dependencies are resolved
    const updatedTask = await this.taskModel.findById(task._id);
    const canStart = this.canTaskStart(updatedTask);

    if (canStart && updatedTask.dependencyState !== 'active') {
      // Transition to ready
      await this.taskModel.findByIdAndUpdate(task._id, {
        $set: { dependencyState: 'ready', dependencyResolvedAt: new Date() },
      });

      // Notify
      await this.notifyDependencyResolved(task._id.toString());

      // Auto-start if enabled
      if (updatedTask.autoStartOnDependency) {
        await this.tasksService.dispatchTask(task._id.toString());
      }
    }
  }
}

private canTaskStart(task: TaskDocument): boolean {
  const hardBlockers = task.dependencies.filter(
    d => d.blockingBehavior === 'hard' && d.currentState !== 'resolved',
  );
  return hardBlockers.length === 0;
}
```

### 11.3 Reverse Lookup: What Blocks This PR?

Add to GitHub PR template (optional):

```markdown
## AI Tasks Waiting for This PR

<!-- Will be auto-populated by bot -->
- Task #123: "Implement dashboard" (will auto-start when merged)
- Task #456: "Add tests for payments" (can start after merge)

Merge this PR to unblock dependent tasks.
```

---

## 12. Implementation Tasks

### Phase 1: Core Dependency Model (Complexity: Medium)

- [ ] **1.1** Update Task schema with `dependencies` field
- [ ] **1.2** Create `Dependency` interface/DTO
- [ ] **1.3** Add database indexes for dependency lookups
- [ ] **1.4** Create `DependencyService` with core methods:
  - `addDependency(taskId, dependency): Promise<void>`
  - `removeDependency(taskId, depId): Promise<void>`
  - `detectCycle(taskId, dependsOnTaskId): Promise<boolean>`
  - `canTaskStart(taskId): Promise<boolean>`
- [ ] **1.5** Add validation: cycle detection, task existence checks
- [ ] **1.6** Write unit tests for `DependencyService`

**Estimated Effort:** 3-4 days

### Phase 2: Dependency State Management (Complexity: Medium)

- [ ] **2.1** Create `DependencyStateService` to track states
- [ ] **2.2** Implement state machine: pending → ready → active → resolved
- [ ] **2.3** Add `dependencyState` field to Task schema
- [ ] **2.4** Create handler: `onDependencyResolved(taskId)`
- [ ] **2.5** Create handler: `onDependencyFailed(taskId)`
- [ ] **2.6** Add auto-start logic (transition to DISPATCHED)
- [ ] **2.7** Write integration tests for state transitions

**Estimated Effort:** 3-4 days

### Phase 3: API Endpoints (Complexity: Low-Medium)

- [ ] **3.1** POST `/api/tasks/:id/dependencies` (add dependency)
- [ ] **3.2** DELETE `/api/tasks/:id/dependencies/:depId` (remove)
- [ ] **3.3** GET `/api/tasks/:id/dependencies` (list with state)
- [ ] **3.4** GET `/api/tasks/:id/dependency-graph` (for visualization)
- [ ] **3.5** POST `/api/tasks/:id/override-dependencies` (force start)
- [ ] **3.6** GET `/api/tasks?dependencyState=blocked` (filter)
- [ ] **3.7** Add DTOs: CreateDependencyDto, DependencyResponseDto
- [ ] **3.8** Add error handling: 400 circular, 404 not found
- [ ] **3.9** Write endpoint tests

**Estimated Effort:** 2-3 days

### Phase 4: GitHub Integration (Complexity: Medium)

- [ ] **4.1** Enhance `github.webhook.service.ts` with PR merge handler
- [ ] **4.2** Add logic: `handlePullRequestMerged(repo, prNumber)`
- [ ] **4.3** Look up dependent tasks in database
- [ ] **4.4** Update dependency states
- [ ] **4.5** Trigger auto-start if enabled
- [ ] **4.6** Send notifications
- [ ] **4.7** Handle external issue close events (optional)
- [ ] **4.8** Write webhook tests with mock GitHub events

**Estimated Effort:** 2-3 days

### Phase 5: Notifications (Complexity: Low)

- [ ] **5.1** Create `DependencyNotificationService`
- [ ] **5.2** Implement notification templates: blocked, unblocked, resolved, auto-started
- [ ] **5.3** Send to Web (in-app), Slack (if applicable)
- [ ] **5.4** Add notification events to task audit log
- [ ] **5.5** Write notification tests

**Estimated Effort:** 1-2 days

### Phase 6: Frontend — Basic UI (Complexity: Medium)

- [ ] **6.1** Create `AddDependencyModal` component
- [ ] **6.2** Create `DependencyList` component
- [ ] **6.3** Create `DependencyStatus` indicator component
- [ ] **6.4** Add "Dependencies" section to Task form
- [ ] **6.5** Add "Dependencies" panel to Task detail page
- [ ] **6.6** Add filter to Task dashboard
- [ ] **6.7** Write component tests

**Estimated Effort:** 3-4 days

### Phase 7: Frontend — Dependency Graph (Complexity: High)

- [ ] **7.1** Install and configure ReactFlow library
- [ ] **7.2** Create `DependencyGraph` component
- [ ] **7.3** Fetch graph data from backend
- [ ] **7.4** Render nodes (task, PR, issue) with colors
- [ ] **7.5** Render directed edges with labels
- [ ] **7.6** Implement click-to-open task detail
- [ ] **7.7** Implement zoom/pan/export
- [ ] **7.8** Write tests

**Estimated Effort:** 3-4 days

### Phase 8: Testing & Documentation (Complexity: Medium)

- [ ] **8.1** Write integration test: task creation with dependencies
- [ ] **8.2** Write integration test: dependency resolution workflow
- [ ] **8.3** Write integration test: circular dependency detection
- [ ] **8.4** Write E2E test: full user journey (Web UI)
- [ ] **8.5** Write E2E test: GitHub PR merge triggering auto-start
- [ ] **8.6** Update API documentation
- [ ] **8.7** Create user guide (in wiki or docs/)
- [ ] **8.8** Update CLAUDE.md with dependency conventions

**Estimated Effort:** 2-3 days

### Phase 9: Deployment & Monitoring (Complexity: Low)

- [ ] **9.1** Add feature flag: `ENABLE_TASK_DEPENDENCIES` (default: false for gradual rollout)
- [ ] **9.2** Add database migration (if needed)
- [ ] **9.3** Add monitoring: dependency resolution time, blocked task count
- [ ] **9.4** Add logging: dependency state changes
- [ ] **9.5** Deploy to staging and test
- [ ] **9.6** Enable feature flag for 10% of users (canary)
- [ ] **9.7** Monitor and rollout to 100%

**Estimated Effort:** 1-2 days

---

## 13. Implementation Complexity Estimates

### By Component

| Component | Complexity | Effort | Risk |
|-----------|-----------|--------|------|
| **Database Schema** | Low | 4 hours | Low |
| **DependencyService** (core logic) | Medium | 2 days | Medium (cycle detection) |
| **DependencyStateService** | Medium | 2 days | Medium (state transitions) |
| **API Endpoints** | Low-Medium | 2 days | Low |
| **GitHub Integration** | Medium | 2 days | Medium (webhook timing) |
| **Notifications** | Low | 1 day | Low |
| **Frontend — Basic UI** | Medium | 3 days | Low |
| **Frontend — Graph** | High | 3-4 days | Medium (React Flow learning curve) |
| **Testing** | Medium | 2 days | Low |
| **Deployment** | Low | 1 day | Low |
| **TOTAL** | **Medium** | **18-20 days** | **Medium** |

### By Risk Level

**High Risk:**
- Circular dependency detection (complex graph algorithms)
- Webhook timing issues (race conditions when PR merges and task checks dependencies)
- Database performance at scale (if many dependencies per task)

**Medium Risk:**
- Frontend graph rendering performance
- State machine edge cases (what if dependency resolves while task is already coding?)
- Notification timing

**Low Risk:**
- Basic CRUD operations
- API endpoints
- UI components (standard React patterns)

---

## 14. Rollout Strategy

### Phase 1: MVP (No UI)
1. Ship core dependency service + API endpoints
2. Manual testing via cURL/Postman
3. No UI yet
4. Feature flag: OFF by default

### Phase 2: Basic UI
1. Add "Add Dependency" button to task form
2. Show dependency status on task detail
3. Feature flag: ON for beta users
4. Gather feedback

### Phase 3: Advanced UI
1. Add dependency graph visualization
2. Add dashboard filters
3. Add notification system
4. Feature flag: ON for all users

### Phase 4: Polish & Performance
1. Optimize database queries
2. Add caching for dependency graphs
3. Implement batch dependency resolution
4. Monitor and tune

---

## 15. Backward Compatibility

- Existing tasks (without dependencies) are unaffected
- `dependencies` field defaults to empty array
- `dependencyState` defaults to 'ready' (task can start immediately)
- No breaking API changes
- Feature flag allows gradual rollout

---

## 16. Success Metrics

- **Adoption:** X% of new tasks have dependencies within 3 months
- **Time Saved:** Average time to complete task sequences reduced by 30%
- **Error Reduction:** Fewer out-of-order task completions
- **User Satisfaction:** NPS score increase in dependency management
- **Performance:** Dependency resolution < 5s, graph rendering < 2s

---

## 17. Related Issues / Constraints

**Constraint 1:** MongoDB doesn't support foreign key constraints, so we must validate references in code.

**Constraint 2:** Large dependency graphs may impact performance. For >100 tasks, consider:
- Batch dependency resolution
- Caching dependency graphs
- Moving to separate DependencyEdge collection

**Constraint 3:** GitHub webhook reliability — PR merge event may be delayed or missed. Mitigation: periodic sync job (cron) to check for resolved dependencies.

**Future Enhancement:** Task orchestration / workflow engine (e.g., Temporal, AWS Step Functions) for complex multi-task workflows.

---

## Appendix A: Example Workflows

### Workflow 1: Feature Release
```
Task 1: "Implement payment module" (bug-fix)
  ↓
Task 2: "Write payment tests" (depends on Task 1)
  ↓
Task 3: "Update API docs" (depends on Task 2)
  ↓
Task 4: "Create Stripe webhook handler" (depends on PR #42 merged)
  ↓
Task 5: "Deploy to production" (depends on Tasks 1, 2, 4)
```

### Workflow 2: Bug Fix Chain
```
Task A: "Fix database migration bug" (urgent)
  ↓
Task B: "Re-run failed migration" (depends on Task A)
  ↓
Task C: "Verify data integrity" (depends on Task B)
  ↓
Slack notification: "Issue #999 can now be closed"
```

### Workflow 3: Multi-Team Coordination
```
Task X (team-a): "Implement API endpoint"
  │
  ├─→ depends on PR #100 (team-b) "Database schema update"
  │
  └─→ depends on Issue mothership/platform#999 "Auth service upgrade"
```

---

## Appendix B: Error Codes

| Code | Status | Meaning | Recovery |
|------|--------|---------|----------|
| `DEP_001` | 400 | Cycle detected | Remove one dependency |
| `DEP_002` | 404 | Dependency not found | Re-add or verify ID |
| `DEP_003` | 409 | Dependency already exists | Check existing dependencies |
| `DEP_004` | 400 | Invalid dependency type | Use 'task', 'pr', 'external_issue' |
| `DEP_005` | 500 | Failed to resolve dependency | Retry or contact support |

---

## Appendix C: Configuration

**Environment Variables (Optional):**

```bash
# Enable/disable dependency feature
TASK_DEPENDENCIES_ENABLED=true

# Dependency resolution timeout (seconds)
DEPENDENCY_RESOLUTION_TIMEOUT=3600

# Auto-fail dependent tasks on failure?
DEPENDENCY_AUTO_FAIL_ON_FAILURE=false

# TTL for "expired" status (days)
DEPENDENCY_EXPIRED_TTL=7

# Batch size for dependency resolution jobs
DEPENDENCY_BATCH_SIZE=100

# Enable dependency graph visualization?
DEPENDENCY_GRAPH_ENABLED=true

# Max dependency depth (for cycle detection)
DEPENDENCY_MAX_DEPTH=50
```

---

## Appendix D: Frequently Asked Questions

**Q: What if a PR dependency is from a different repo?**
A: Fully supported. Specify `repo: "mothership/other-service"` in the dependency.

**Q: Can I depend on a task that depends on me (cycle)?**
A: No. The system detects and rejects this with 400 Circular Dependency error.

**Q: What if I override dependencies and the task fails?**
A: The task fails as normal. The override is logged in the audit trail for debugging.

**Q: Will task auto-start if I set `autoStartOnDependency: true`?**
A: Yes, the task will automatically transition from PENDING → READY → DISPATCHED, creating the GitHub issue.

**Q: Can I change dependencies after the task is dispatched?**
A: No. Dependencies are locked once the task enters DISPATCHED status to prevent race conditions.

**Q: What happens if a dependent task is manually dispatched while dependencies are pending?**
A: The task will start normally (dependencies don't prevent dispatch, only advisory). A warning is shown in the UI.

---

**End of Specification Document**
