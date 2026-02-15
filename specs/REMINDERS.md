# AI Pipeline — Reminders Feature Specification

**Version:** 1.0
**Status:** Draft
**Target Release:** Q2 2026
**Dependencies:** Core API (feat/core-api), Slack Integration (feat/slack)

---

## 1. Overview

### Problem Statement

Users managing AI coding tasks often miss important updates or deadlines. Tasks can stall in clarification, pull requests may sit unreviewed for days, or failed tasks may be forgotten. This creates delays in the development workflow and reduces visibility into task progress.

The Reminders feature provides intelligent, configurable notifications that alert users when:
- Tasks are stuck waiting for input or action
- Code reviews are pending
- SLAs are approaching
- Failures require attention

Reminders respect user preferences for frequency, channels, and snooze periods, preventing notification fatigue while ensuring critical issues surface.

### Goals

1. **Visibility** — Ensure no task is forgotten or overlooked
2. **Timeliness** — Notify users at appropriate intervals (not too frequent, not too late)
3. **Flexibility** — Let users customize reminder rules and preferences
4. **Integration** — Use existing channels (in-app, email, Slack)
5. **Acknowledgment** — Support snoozing, dismissing, and resolving reminders

---

## 2. User Stories

### Story 1: Stuck Clarification Reminders
**As a** task creator
**I want to** be reminded when a task is waiting for my clarification answer for more than 24 hours
**So that** I don't forget to respond and unblock the agent

**Acceptance Criteria:**
- Reminder triggers 24h after task enters `needs_clarification` status
- Reminder repeats every 24h until task is answered or dismissed
- Reminder includes link to the task and the pending questions
- User can snooze for 4h, 12h, or 24h

### Story 2: PR Review Needed Reminder
**As a** task creator or team member
**I want to** be notified when a PR is ready for review
**So that** I can provide timely feedback and merge code quickly

**Acceptance Criteria:**
- Reminder sent immediately when PR status changes to `pr_open`
- Reminder includes PR title, description preview, and GitHub link
- User can dismiss if someone else is reviewing
- Repeats after 48h if PR still open (configurable)

### Story 3: Aging PR Reminder
**As a** project manager
**I want to** be reminded when a PR has been open for 3+ days without merge
**So that** I can identify stalled reviews and remove blockers

**Acceptance Criteria:**
- First reminder at 3 days, then repeats every 2 days
- Configurable threshold per user (default 3 days)
- Shows PR status (open, draft, changes requested, review approved, etc.)
- Link to PR and assignees

### Story 4: Failed Task Reminder
**As a** task creator
**I want to** be notified immediately when a task fails
**So that** I can decide whether to retry or adjust the scope

**Acceptance Criteria:**
- Reminder sent immediately when task status becomes `failed`
- Includes error message and task description
- Suggests retry or cancel action
- Links to task detail for investigation

### Story 5: Custom User-Set Reminders
**As a** any user
**I want to** set reminders for specific tasks without automatic rules
**So that** I can stay on top of important work

**Acceptance Criteria:**
- Can set reminder via task detail UI: "Remind me in 2 hours"
- One-time or recurring option
- Shows countdown until reminder triggers
- Can edit or cancel before trigger time

### Story 6: Batch Reminder Digest
**As a** a busy user with many tasks
**I want to** receive reminders as a daily email digest instead of multiple notifications
**So that** I can review all pending work in one go

**Acceptance Criteria:**
- User can select "Daily digest" preference
- Email sent at user-configured time (default 9 AM)
- Groups reminders by category (stuck, pr_review, failed, etc.)
- Can switch back to real-time notifications anytime

### Story 7: Remind Team on Overdue Tasks
**As a** a tech lead
**I want to** see a dashboard widget showing all tasks overdue by their SLA
**So that** I can prioritize and escalate if needed

**Acceptance Criteria:**
- Dashboard widget shows top 5 overdue tasks
- Color-coded by severity (green < 1 day, yellow 1-3 days, red > 3 days)
- Clicking a task shows full details and history
- Updates in real-time (or every 30 seconds)

### Story 8: Mute Reminders for Low-Priority Tasks
**As a** a user
**I want to** disable reminders for a specific task or repo
**So that** I don't get notifications for tasks I'm not actively working on

**Acceptance Criteria:**
- Task detail page has "Mute reminders" toggle
- Reminders can be muted per-task or per-repo
- Can unmute anytime from dashboard or settings
- Persists across sessions

---

## 3. Reminder Types

### Type A: Task Stuck in Clarification

**Trigger Condition:**
`status == 'needs_clarification' && (now - enteredClarificationAt > 24h)`

**Initial Delay:** 24 hours
**Recurrence:** Every 24 hours until answered or dismissed
**Content:**
```
Task waiting for your input for 24+ hours

[Task Title]
[Questions preview]
[Link to answer]
```

**Channels:** In-app, Email, Slack DM
**Actions:**
- View task → Answer questions
- Snooze → 4h, 12h, 24h
- Dismiss → Suppress until next recurrence
- Mute → Disable all reminders for this task

---

### Type B: PR Ready for Review

**Trigger Condition:**
`githubPrStatus == 'open' && (status == 'pr_open')`

**Initial Delay:** Immediate (within 1 minute of PR creation)
**Recurrence:** Configurable, default 48 hours
**Content:**
```
PR ready for review

[PR Title]
[Branch]
[Assignee(s)]
[Link to PR]
```

**Channels:** In-app (badge), Email (if opted-in), Slack (if available)
**Actions:**
- Review PR (link to GitHub)
- Dismiss (someone else is reviewing)
- Configure reminder frequency

---

### Type C: PR Open Too Long

**Trigger Condition:**
`githubPrStatus == 'open' && (now - prCreatedAt > 3 days)`

**Initial Delay:** 3 days
**Recurrence:** Every 2 days
**Content:**
```
PR open for 3+ days — needs attention

[PR Title]
[Days open]
[Current status: Draft / Changes Requested / Approved / etc.]
[Assignee(s)]
[Link to PR]
```

**Channels:** In-app, Email, Slack
**Actions:**
- Review/merge PR
- Check status
- Snooze for 24h
- Mute reminders
- Configure threshold

---

### Type D: Failed Task

**Trigger Condition:**
`status == 'failed'`

**Initial Delay:** Immediate
**Recurrence:** Once per day for 3 days, then stops
**Content:**
```
Task failed — action required

[Task Title]
[Error: {errorMessage}]
[Link to task detail]
[Action: Retry / Cancel / Investigate]
```

**Channels:** In-app (priority badge), Email, Slack DM
**Actions:**
- Retry task
- View error details
- Cancel task
- Dismiss reminder

---

### Type E: Custom User-Set Reminder

**Trigger Condition:**
`customReminder.scheduledFor <= now`

**Initial Delay:** User-defined (30 min to 30 days)
**Recurrence:** One-time or recurring
**Content:**
```
Reminder: [User-defined text]

[Task: {taskTitle}]
[Link to task]
```

**Channels:** In-app, Email, Slack
**Actions:**
- View task
- Snooze
- Dismiss
- Edit reminder (change schedule/text)
- Delete reminder

---

### Type F: Low-Activity Summary (Weekly/Daily Digest)

**Trigger Condition:**
User has opted into digest mode AND digest trigger time reached

**Initial Delay:** User-configured (e.g., 9 AM daily, or 9 AM Monday)
**Recurrence:** Daily or weekly per user setting
**Content:**
```
Your AI Pipeline Summary — [Date]

Stuck (waiting for input):
- Task A (24h overdue)
- Task B (12h overdue)

PRs Needing Review:
- PR #42 (3 days open)
- PR #43 (1 day open)

Failed:
- Task C (2 days ago)

[View full dashboard]
```

**Channels:** Email only
**Actions:**
- Click task → Opens task detail
- View dashboard
- Manage preferences

---

## 4. Notification Channels

### 4.1 In-App Notifications

**Location:** Top-right notification bell icon
**Behavior:**
- Unread count badge on bell
- Click bell → dropdown list of recent 10 reminders
- Each reminder shows: icon (type), title, timestamp, quick action buttons
- Older reminders push to a "View All" screen

**Persistence:** 30 days in database, purged after dismissed
**Real-time:** WebSocket via NestJS gateway or polling every 30 seconds

**Design Example:**
```
🔔 (3)
├─ ⚠️  Task clarification overdue (5h ago) [Answer] [Dismiss]
├─ 📝 PR #42 ready for review (2h ago) [Review] [Dismiss]
└─ ❌ Task failed (30m ago) [Retry] [Dismiss]
```

### 4.2 Email Notifications

**Sender:** `reminders@ai-pipeline.up.railway.app`
**Template:**
- Subject: `[AI Pipeline] {type}: {title}`
- HTML template with branding, task details, action links
- Unsubscribe link for reminder type

**Frequency Control:**
- Per reminder type (e.g., "Daily digest only", "Real-time for PR reviews")
- Global override ("Turn off all emails")

**Formatting:**
- Plaintext fallback
- Responsive design
- CTA buttons link to in-app task detail OR GitHub
- Include unique tracking ID for analytics

### 4.3 Slack DM Notifications

**Sent via:** Slack Bot (requires `chat:write` scope)
**Target:** Slack user mapped to GitHub user via OAuth

**Message Format:**
```
Hi {first_name}, a task needs your attention:

{emoji} {reminder_type}: {title}

{details_snippet}

[View Task] [Snooze 4h] [Dismiss]
```

**Threading:**
- Replies in thread for snooze/dismiss actions
- App updates thread with "Snoozed until {time}"

**Frequency:**
- Respects user's email preference
- Can set "Slack only" mode (no email)
- Digest support: batch reminders into one message per day

**Mentions:**
- For urgent (failed tasks): mention user with `@` if configured
- For team reminders (overdue PRs): mention assignees

---

## 5. Reminder Rules & Thresholds

### Configuration Defaults (User-Overridable)

| Reminder Type | Initial Delay | Recurrence | Max Reminders |
|---|---|---|---|
| Stuck clarification | 24h | Every 24h | 7 (then stops) |
| PR review ready | Immediate | 48h | 5 (then stops) |
| PR open too long | 3 days | Every 2 days | 10 |
| Failed task | Immediate | 1x per day | 3 days |
| Custom | User-defined | User-defined | User-defined |

### User Preferences (Configurable in Settings)

1. **Clarification Threshold** (hours, default 24)
2. **PR Review Reminder Frequency** (off, 12h, 24h, 48h, manual only)
3. **PR Age Threshold** (days, default 3)
4. **PR Age Recurrence** (12h, 24h, 48h, 72h)
5. **Failed Task Reminders** (on/off, default on)
6. **Digest Preference** (real-time, daily, weekly, off)
7. **Digest Time** (HH:MM, default 9 AM local time)
8. **Preferred Channels** (in-app, email, slack, combinations)
9. **Quiet Hours** (HH:MM to HH:MM, no notifications outside this window)
10. **Repo-Level Overrides** (can disable reminders for specific repo)

### Per-Task Muting

| Level | Scope | Duration |
|---|---|---|
| Task-level mute | Only this task | Permanent (until unmuted) |
| Repo-level mute | All tasks in repo | Permanent |
| Temporary snooze | Specific reminder | 4h, 12h, 24h, 48h, 1 week |

---

## 6. Snooze & Dismiss

### Snooze

**Definition:** Temporarily suppress a reminder. It will re-trigger after the snooze period.

**Durations:**
- 4 hours
- 12 hours
- 24 hours
- 48 hours
- 1 week (168 hours)
- Custom (enter number of hours, 1-720)

**Behavior:**
- Notification is removed from in-app bell
- Email does not send
- After snooze expires, reminder is re-evaluated:
  - If condition still met (e.g., still in clarification), re-show reminder
  - If condition cleared (e.g., PR merged), do not show

**Storage:**
```json
{
  "reminderId": "...",
  "snoozeUntil": "2026-02-16T14:30:00Z",
  "snoozedAt": "2026-02-16T10:30:00Z",
  "snoozedBy": "user_id"
}
```

### Dismiss

**Definition:** Suppress a specific reminder instance permanently until condition changes.

**Behavior:**
- User clicks "Dismiss" on a reminder
- Reminder removed from queue
- If task state changes (e.g., PR reopens), dismiss is cleared and reminder can re-trigger
- If task state stays same, no further reminders (until manual unmute)

**Storage:**
```json
{
  "reminderId": "...",
  "dismissedAt": "2026-02-16T10:30:00Z",
  "dismissedBy": "user_id",
  "dismissReason": "not_applicable" | "will_handle_later" | "already_aware" | null
}
```

### Difference Summary

| Action | Effect | Duration | Re-triggers? |
|---|---|---|---|
| **Snooze** | Suppress for time period | 4h - 1 week | Yes, if condition still met |
| **Dismiss** | Suppress until condition changes | Until task state changes | Yes, if relevant event occurs |
| **Mute** | Disable all reminders for task/repo | Permanent | No, until explicitly unmuted |

---

## 7. User Preferences

### Preferences Schema

**Collection:** `user_preferences`

```typescript
interface UserPreferences {
  userId: string;                              // MongoDB ObjectId or GitHub username
  createdAt: Date;
  updatedAt: Date;

  // Notification channels
  channels: {
    inApp: boolean;                            // Default: true
    email: boolean;                            // Default: true
    slack: boolean;                            // Default: true (if Slack linked)
  };

  // Reminder type toggles
  reminders: {
    stuckClarification: boolean;               // Default: true
    prReviewReady: boolean;                    // Default: true
    prOpenTooLong: boolean;                    // Default: true
    failedTasks: boolean;                      // Default: true
    customReminders: boolean;                  // Default: true
  };

  // Thresholds (hours/days)
  thresholds: {
    clarificationDelayHours: number;           // Default: 24
    prOpenDaysThreshold: number;               // Default: 3
    prReviewReminderIntervalHours: number;     // Default: 48
  };

  // Digest preferences
  digest: {
    enabled: boolean;                          // Default: false
    frequency: 'daily' | 'weekly';             // Default: 'daily'
    time: string;                              // HH:MM in user's timezone, default: "09:00"
    categories: string[];                      // Which reminder types to include
  };

  // Quiet hours
  quietHours: {
    enabled: boolean;                          // Default: false
    startTime: string;                         // HH:MM, default: "18:00"
    endTime: string;                           // HH:MM, default: "09:00" (next day)
    timezone: string;                          // IANA timezone, default: "UTC"
  };

  // Repo overrides
  repoPreferences: {
    [repoName: string]: {
      enabled: boolean;
      channels: string[];
      customThresholds?: {
        clarificationDelayHours?: number;
        prOpenDaysThreshold?: number;
      };
    };
  };

  // Snooze history (for analytics)
  snoozedReminders: Array<{
    reminderId: string;
    snoozedAt: Date;
    snoozeDurationHours: number;
    snoozedUntil: Date;
  }>;
}
```

### Preferences UI Location

**Path:** `/settings/reminders`

**Sections:**
1. **Quick Toggle** — Turn on/off all reminders
2. **Notification Channels** — Email, Slack, In-app checkboxes
3. **Reminder Types** — Toggle each type individually
4. **Thresholds** — Slider/input for hours/days
5. **Digest Settings** — Frequency, time, timezone, categories
6. **Quiet Hours** — Start/end time, timezone
7. **Repo Overrides** — Table of repos with custom settings
8. **Clear History** — Clear all snoozed/dismissed reminders

---

## 8. Database Changes

### 8.1 New Collections

#### Collection: `reminders`

```typescript
@Schema({ timestamps: true, collection: 'reminders' })
export class Reminder {
  // Identity
  @Prop({ required: true, index: true })
  userId: string;  // Target user's ID or GitHub username

  @Prop({ required: true, index: true })
  taskId: string;  // Reference to task._id

  @Prop({ required: true })
  type: string;    // 'stuck_clarification' | 'pr_review' | 'pr_overdue' | 'task_failed' | 'custom'

  @Prop({ required: true })
  title: string;   // Human-readable title

  @Prop()
  description?: string;  // Optional longer description

  // Schedule
  @Prop({ required: true, index: true })
  scheduledFor: Date;    // When to trigger

  @Prop()
  nextRecurrenceAt?: Date;  // When next reminder will trigger (null if one-time)

  @Prop({ default: 'pending' })
  status: string;  // 'pending' | 'sent' | 'snoozed' | 'dismissed' | 'completed' | 'failed'

  @Prop()
  sentAt?: Date;   // When the reminder was sent

  // State management
  @Prop({ type: Object })
  payload: {
    taskTitle?: string;
    taskDescription?: string;
    githubUrl?: string;
    githubNumber?: number;
    errorMessage?: string;
    [key: string]: any;
  };

  @Prop()
  snoozeUntil?: Date;

  @Prop()
  snoozeCount: number = 0;

  @Prop()
  dismissedAt?: Date;

  @Prop()
  dismissReason?: string;  // 'not_applicable' | 'already_aware' | 'will_handle_later'

  // Configuration
  @Prop({ default: 1 })
  recurrenceCount: number;  // How many times has this reminder fired

  @Prop()
  maxRecurrences?: number;  // Max times to send (null = infinite)

  @Prop({ default: 0 })
  failureCount: number;     // How many times sending failed

  @Prop({ type: [String], default: [] })
  sentVia: string[];        // ['in-app'] | ['email'] | ['slack'] | combinations

  @Prop()
  metadata?: {
    prNumber?: number;
    prStatus?: string;
    clarificationAge?: number;  // hours
    [key: string]: any;
  };

  // Indexing
  @Prop({ index: true })
  createdAt: Date;

  @Prop({ index: true })
  updatedAt: Date;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);
ReminderSchema.index({ userId: 1, status: 1 });
ReminderSchema.index({ taskId: 1, type: 1 });
ReminderSchema.index({ scheduledFor: 1 });
ReminderSchema.index({ snoozeUntil: 1 }, { sparse: true });
ReminderSchema.index({ type: 1, status: 1 });
```

#### Collection: `user_preferences`

```typescript
@Schema({ timestamps: true, collection: 'user_preferences' })
export class UserPreference {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ type: Object, default: { inApp: true, email: true, slack: true } })
  channels: { inApp: boolean; email: boolean; slack: boolean };

  @Prop({ type: Object })
  reminders: {
    stuckClarification: boolean;
    prReviewReady: boolean;
    prOpenTooLong: boolean;
    failedTasks: boolean;
    customReminders: boolean;
  };

  @Prop({ type: Object })
  thresholds: {
    clarificationDelayHours: number;
    prOpenDaysThreshold: number;
    prReviewReminderIntervalHours: number;
  };

  @Prop({ type: Object })
  digest: {
    enabled: boolean;
    frequency: 'daily' | 'weekly';
    time: string;
    timezone: string;
    categories: string[];
  };

  @Prop({ type: Object })
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
  };

  @Prop({ type: Map, of: Object, default: {} })
  repoPreferences: Map<string, any>;

  @Prop({ type: [Object], default: [] })
  snoozedReminders: Array<{
    reminderId: string;
    snoozedAt: Date;
    snoozeDurationHours: number;
  }>;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}
```

#### Collection: `reminder_queue`

Used for scheduled jobs (if using Bull queue):

```typescript
@Schema({ timestamps: true, collection: 'reminder_queue' })
export class ReminderQueueItem {
  @Prop({ required: true })
  reminderId: string;

  @Prop({ required: true })
  jobId: string;  // Bull job ID

  @Prop()
  scheduledFor: Date;

  @Prop({ default: 'pending' })
  status: string;  // 'pending' | 'processing' | 'completed' | 'failed'

  @Prop()
  error?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  createdAt: Date;
}
```

### 8.2 Updates to Task Schema

Add reminders array to Task:

```typescript
// In src/common/schemas/task.schema.ts
@Prop({ type: [String], default: [] })
reminderIds: string[];  // References to Reminder._id

@Prop()
lastReminderAt?: Date;  // Cache: when was last reminder sent
```

---

## 9. Integration with Scheduled Jobs

### 9.1 Job Scheduler

**Technology:** Bull + Redis OR Node-cron (simple jobs, no persistence)

**Option A: Bull Queue (Recommended for Production)**

```
Reminder Service
  ├─ ReminderQueueConsumer (worker)
  │   ├─ Listen for 'reminder:trigger' events
  │   ├─ Fetch reminder from DB
  │   ├─ Validate conditions (not snoozed, not dismissed)
  │   ├─ Render message for each channel
  │   └─ Send via email/Slack/in-app
  │
  └─ ScheduleReminderJob (creates Bull jobs)
      ├─ Every 5 minutes, scan DB for pending reminders
      ├─ Create Bull job with delay = (scheduledFor - now)
      └─ Update reminder status to 'scheduled'
```

**Cron Task (runs every minute):**
```typescript
@Cron('* * * * *')  // Every minute
async processPendingReminders() {
  // Find all reminders where:
  // - status == 'pending' or 'snoozed' (and snoozeUntil <= now)
  // - scheduledFor <= now
  // - snoozeUntil is null or past
  // - status != 'dismissed'

  const reminders = await this.reminderModel.find({
    status: { $in: ['pending', 'snoozed'] },
    scheduledFor: { $lte: new Date() },
    $or: [
      { snoozeUntil: null },
      { snoozeUntil: { $lte: new Date() } }
    ]
  });

  for (const reminder of reminders) {
    // Add to Bull queue
    await this.reminderQueue.add(
      'send-reminder',
      { reminderId: reminder._id },
      { delay: 0 }  // Process immediately
    );
  }
}
```

**Option B: Simple Cron (MVP)**

```typescript
// src/reminders/jobs/reminder-cron.service.ts
@Injectable()
export class ReminderCronService {
  constructor(
    private reminderService: ReminderService,
    private logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkAndSendReminders() {
    try {
      const pending = await this.reminderService.findPending();
      for (const reminder of pending) {
        await this.reminderService.send(reminder);
      }
    } catch (error) {
      this.logger.error('Failed to process reminders', error);
    }
  }
}
```

### 9.2 Reminder Evaluation Engine

Before sending, re-check if reminder is still valid:

```typescript
async evaluateReminder(reminder: Reminder): Promise<boolean> {
  const task = await this.taskModel.findById(reminder.taskId);

  if (!task) {
    // Task deleted, mark reminder completed
    reminder.status = 'completed';
    return false;
  }

  if (reminder.dismissedAt) {
    // Check if condition has changed since dismiss
    if (this.hasConditionChanged(reminder, task)) {
      reminder.dismissedAt = null;  // Clear dismiss
    } else {
      return false;  // Still dismissed
    }
  }

  if (reminder.snoozeUntil && reminder.snoozeUntil > new Date()) {
    // Snooze still active
    return false;
  } else if (reminder.snoozeUntil) {
    reminder.snoozeUntil = null;  // Clear expired snooze
  }

  // Re-evaluate condition
  const condition = this.evaluateCondition(reminder, task);
  if (!condition) {
    reminder.status = 'completed';
    return false;
  }

  return true;
}

private evaluateCondition(reminder: Reminder, task: Task): boolean {
  switch (reminder.type) {
    case 'stuck_clarification':
      const clarHours = (new Date().getTime() - task.updatedAt.getTime()) / (1000 * 60 * 60);
      return task.status === 'needs_clarification' && clarHours > 24;

    case 'pr_review':
      return task.status === 'pr_open' && task.githubPrStatus === 'open';

    case 'pr_overdue':
      const prDays = (new Date().getTime() - new Date(task.dispatchedAt).getTime()) / (1000 * 60 * 60 * 24);
      return task.status === 'pr_open' && prDays > 3 && task.githubPrStatus === 'open';

    case 'task_failed':
      return task.status === 'failed';

    case 'custom':
      return true;  // Always valid; user-created reminders don't re-evaluate

    default:
      return false;
  }
}
```

### 9.3 Automatic Reminder Creation

**When tasks transition states, auto-create reminders:**

```typescript
// In TasksService
async updateTaskStatus(taskId: string, newStatus: TaskStatus) {
  const task = await this.taskModel.findByIdAndUpdate(taskId, { status: newStatus });

  // Emit domain event
  this.eventEmitter.emit('task.status_changed', { task, newStatus });
}

// In ReminderService (listening to events)
@OnEvent('task.status_changed')
async onTaskStatusChanged(payload: { task: Task; newStatus: TaskStatus }) {
  const { task, newStatus } = payload;

  switch (newStatus) {
    case TaskStatus.NEEDS_CLARIFICATION:
      await this.createReminder({
        userId: task.createdBy,
        taskId: task._id,
        type: 'stuck_clarification',
        title: `Task waiting for clarification: ${task.llmSummary}`,
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24h from now
        maxRecurrences: 7,
      });
      break;

    case TaskStatus.PR_OPEN:
      await this.createReminder({
        userId: task.createdBy,
        taskId: task._id,
        type: 'pr_review',
        title: `PR #${task.githubPrNumber} ready for review`,
        scheduledFor: new Date(),  // Immediate
        maxRecurrences: 5,
      });
      break;

    case TaskStatus.FAILED:
      await this.createReminder({
        userId: task.createdBy,
        taskId: task._id,
        type: 'task_failed',
        title: `Task failed: ${task.llmSummary}`,
        description: task.errorMessage,
        scheduledFor: new Date(),  // Immediate
        maxRecurrences: 3,
        payload: { errorMessage: task.errorMessage },
      });
      break;
  }
}
```

---

## 10. API Endpoints

### 10.1 Reminder Management

#### GET /api/reminders

List reminders for current user (paginated).

**Query Params:**
- `status` — 'pending' | 'sent' | 'snoozed' | 'dismissed' | 'completed'
- `type` — 'stuck_clarification' | 'pr_review' | 'pr_overdue' | 'task_failed' | 'custom'
- `taskId` — Filter by task
- `page` — Default: 1
- `limit` — Default: 20

**Response (200):**
```json
{
  "reminders": [
    {
      "id": "...",
      "taskId": "...",
      "type": "stuck_clarification",
      "title": "Task waiting for clarification",
      "status": "pending",
      "scheduledFor": "2026-02-16T10:00:00Z",
      "snoozeUntil": null,
      "payload": { ... }
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20
}
```

#### POST /api/reminders/:id/snooze

Snooze a reminder.

**Request Body:**
```json
{
  "durationHours": 24
}
```

**Response (200):**
```json
{
  "id": "...",
  "status": "snoozed",
  "snoozeUntil": "2026-02-17T10:30:00Z",
  "message": "Reminder snoozed until 2026-02-17 10:30 AM"
}
```

#### POST /api/reminders/:id/dismiss

Dismiss a reminder.

**Request Body:**
```json
{
  "reason": "already_aware"
}
```

**Response (200):**
```json
{
  "id": "...",
  "status": "dismissed",
  "dismissedAt": "2026-02-16T10:30:00Z"
}
```

#### POST /api/reminders/:id/undo-dismiss

Undo a dismiss (clear dismissal flag).

**Response (200):**
```json
{
  "id": "...",
  "status": "pending",
  "dismissedAt": null
}
```

#### DELETE /api/reminders/:id

Delete a reminder completely.

**Response (204 No Content)**

#### POST /api/reminders

Create a custom reminder (user-triggered).

**Request Body:**
```json
{
  "taskId": "...",
  "title": "Follow up on PR review",
  "description": "Check if team has comments",
  "scheduledFor": "2026-02-16T14:00:00Z",
  "recurring": {
    "enabled": false
  },
  "channels": ["in-app", "email"]
}
```

**Response (201):**
```json
{
  "id": "...",
  "taskId": "...",
  "type": "custom",
  "title": "...",
  "status": "pending",
  "scheduledFor": "2026-02-16T14:00:00Z"
}
```

### 10.2 User Preferences

#### GET /api/user/preferences/reminders

Get current user's reminder preferences.

**Response (200):**
```json
{
  "channels": {
    "inApp": true,
    "email": true,
    "slack": true
  },
  "reminders": {
    "stuckClarification": true,
    "prReviewReady": true,
    "prOpenTooLong": true,
    "failedTasks": true,
    "customReminders": true
  },
  "thresholds": {
    "clarificationDelayHours": 24,
    "prOpenDaysThreshold": 3,
    "prReviewReminderIntervalHours": 48
  },
  "digest": {
    "enabled": false,
    "frequency": "daily",
    "time": "09:00",
    "timezone": "UTC"
  },
  "quietHours": {
    "enabled": false,
    "startTime": "18:00",
    "endTime": "09:00",
    "timezone": "UTC"
  },
  "repoPreferences": {}
}
```

#### PATCH /api/user/preferences/reminders

Update reminder preferences.

**Request Body (partial):**
```json
{
  "channels": {
    "email": false
  },
  "thresholds": {
    "clarificationDelayHours": 12
  },
  "digest": {
    "enabled": true,
    "frequency": "daily",
    "time": "09:00"
  }
}
```

**Response (200):**
Returns updated preferences object.

#### PATCH /api/user/preferences/reminders/quiet-hours

Update quiet hours.

**Request Body:**
```json
{
  "enabled": true,
  "startTime": "18:00",
  "endTime": "08:00",
  "timezone": "America/New_York"
}
```

**Response (200):**
```json
{
  "quietHours": {
    "enabled": true,
    "startTime": "18:00",
    "endTime": "08:00",
    "timezone": "America/New_York"
  }
}
```

#### POST /api/user/preferences/reminders/repo-override

Add or update repo-level preference override.

**Request Body:**
```json
{
  "repo": "mothership/finance-service",
  "enabled": false
}
```

**Response (200):**
```json
{
  "repo": "mothership/finance-service",
  "enabled": false
}
```

#### DELETE /api/user/preferences/reminders/repo-override/:repo

Remove repo override (revert to global preferences).

**Response (204 No Content)**

### 10.3 Dashboard/Summary

#### GET /api/reminders/summary

Get summary of reminders for dashboard widget.

**Response (200):**
```json
{
  "pending": 5,
  "snoozed": 2,
  "overdue": [
    {
      "taskId": "...",
      "title": "Task A",
      "type": "stuck_clarification",
      "overdueSince": "24h",
      "link": "/tasks/..."
    },
    {
      "taskId": "...",
      "title": "PR #42",
      "type": "pr_overdue",
      "overdueSince": "3 days",
      "link": "https://github.com/..."
    }
  ]
}
```

---

## 11. Frontend Changes

### 11.1 New Pages/Components

#### `/settings/reminders` — Preferences Page

**Sections:**
1. **Quick Toggle** — Global on/off switch
2. **Notification Channels** — Checkboxes for email, Slack, in-app
3. **Reminder Types** — Toggle each reminder type
4. **Thresholds** — Input fields for hours/days
5. **Digest Settings** — Dropdown for frequency, time picker, timezone
6. **Quiet Hours** — Start/end time pickers, timezone
7. **Repo Overrides** — Table with add/edit/delete buttons
8. **Save** button at bottom

**Component Structure:**
```
src/web/
├── pages/
│   └── settings/
│       └── reminders.tsx
├── components/
│   ├── ReminderPreferences.tsx
│   ├── ReminderChannels.tsx
│   ├── ReminderTypes.tsx
│   ├── ReminderThresholds.tsx
│   ├── DigestSettings.tsx
│   ├── QuietHours.tsx
│   ├── RepoOverrides.tsx
│   └── ReminderRow.tsx
└── hooks/
    └── useReminderPreferences.ts
```

#### Notification Bell (In-App)

**Location:** Top-right navbar

**Component:**
```typescript
<NotificationBell>
  ├─ Badge (count)
  └─ Dropdown
      ├─ List of 10 recent reminders
      ├─ View All link
      ├─ Settings link
      └─ Mark all as read link
```

**Features:**
- Shows unread count
- Click reminder → goes to task detail
- Snooze/Dismiss buttons in dropdown
- Real-time updates via WebSocket or polling

#### Task Detail Card Enhancement

Add reminder controls to task detail:

```
[Task Title]

[Details...]

Reminders:
├─ 🔔 Snooze: [4h] [12h] [24h] [Custom]
├─ 🔕 Mute reminders for this task
└─ ⚙️ Customize threshold
```

#### Dashboard Widget

Add to home page `/` dashboard:

```
┌─────────────────────────────────┐
│ Reminders (5 pending)           │
├─────────────────────────────────┤
│ ⚠️  Task A — 1d overdue         │
│ 📝 PR #42 — Needs review       │
│ ❌ Task C — Failed 2d ago       │
│                                 │
│ [View All] [Settings]           │
└─────────────────────────────────┘
```

### 11.2 Real-Time Updates

**Options:**
1. **WebSocket (NestJS Gateway)** — Instant updates
2. **Polling (30s interval)** — Simple, less resource-intensive
3. **Server-Sent Events (SSE)** — Middle ground

**MVP Approach:** Polling every 30 seconds on dashboard/reminders pages

```typescript
// src/web/hooks/useReminders.ts
export function useReminders() {
  const [reminders, setReminders] = useState([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch('/api/reminders?limit=50');
      const data = await response.json();
      setReminders(data.reminders);
    }, 30000);  // 30 seconds

    return () => clearInterval(interval);
  }, []);

  return reminders;
}
```

### 11.3 Email Templates

**Template:** `/src/reminders/templates/email/`

**Base Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; color: #333; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: #f5f5f5; padding: 20px; }
    .content { padding: 20px; }
    .cta { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
    .footer { background: #f5f5f5; padding: 10px; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>AI Pipeline Reminder</h2>
    </div>
    <div class="content">
      {content_here}
      <p>
        <a href="{link}" class="cta">View Task</a>
      </p>
    </div>
    <div class="footer">
      <p><a href="{unsubscribe_link}">Unsubscribe from this reminder type</a></p>
      <p>AI Pipeline | <a href="{settings_link}">Manage preferences</a></p>
    </div>
  </div>
</body>
</html>
```

**Template Files:**
- `stuck-clarification.html`
- `pr-review.html`
- `pr-overdue.html`
- `task-failed.html`
- `custom-reminder.html`
- `digest.html`

---

## 12. Implementation Tasks

### Phase 1: Core Reminder Infrastructure (Week 1)

**Task 1.1:** Create Reminder schema and database collections
- Create `Reminder` Mongoose schema
- Create `UserPreference` Mongoose schema
- Create indexes on `userId`, `taskId`, `scheduledFor`, `type`, `status`
- Add `reminderIds` array to Task schema
- Complexity: **Low**
- Dependencies: None
- Effort: 3 hours

**Task 1.2:** Create ReminderService
- `createReminder(params)` — Create new reminder
- `findPending()` — Find reminders due to send
- `snooze(reminderId, hours)` — Snooze a reminder
- `dismiss(reminderId, reason)` — Dismiss a reminder
- `undoDismiss(reminderId)` — Clear dismiss
- `evaluateReminder(reminder)` — Check if still valid
- Unit tests
- Complexity: **Medium**
- Effort: 6 hours

**Task 1.3:** Create Reminder cron job (scheduler)
- Implement `@Cron('* * * * *')` to process pending reminders
- Call ReminderService.send() for each pending
- Handle errors, log failures
- Complexity: **Medium**
- Effort: 3 hours

**Task 1.4:** Update TasksService to emit events
- On task status change, emit `task.status_changed` event
- On task creation, emit `task.created` event
- Complexity: **Low**
- Effort: 2 hours

### Phase 2: Send Reminders (Week 1-2)

**Task 2.1:** Implement in-app reminder delivery
- Store reminder in DB with `status='pending'` or `status='sent'`
- Fetch reminders for GET /api/reminders
- Complexity: **Low**
- Effort: 3 hours

**Task 2.2:** Implement email reminder delivery
- Integrate with SendGrid or Nodemailer
- Render email templates (HTML/plaintext)
- Handle delivery failures and retries
- Log email sends for analytics
- Complexity: **Medium**
- Effort: 6 hours

**Task 2.3:** Implement Slack reminder delivery
- Use Slack API to send DMs
- Parse reminder payload and format message
- Add action buttons (snooze, dismiss) via interactive messages
- Handle delivery failures
- Complexity: **Medium**
- Effort: 4 hours

**Task 2.4:** Auto-create reminders on task state changes
- Hook into `task.status_changed` event
- Create `stuck_clarification` reminder when task enters needs_clarification
- Create `pr_review` reminder when task enters pr_open
- Create `task_failed` reminder when task enters failed
- Unit tests
- Complexity: **Medium**
- Effort: 4 hours

### Phase 3: Reminder Preferences & Settings (Week 2)

**Task 3.1:** Create UserPreferences schema and service
- Create `UserPreference` collection
- Implement `getPreferences(userId)` with defaults
- Implement `updatePreferences(userId, changes)`
- Implement `setRepoOverride(userId, repo, settings)`
- Complexity: **Low**
- Effort: 3 hours

**Task 3.2:** Implement preferences API endpoints
- `GET /api/user/preferences/reminders`
- `PATCH /api/user/preferences/reminders`
- `PATCH /api/user/preferences/reminders/quiet-hours`
- `POST /api/user/preferences/reminders/repo-override`
- `DELETE /api/user/preferences/reminders/repo-override/:repo`
- Unit tests
- Complexity: **Low**
- Effort: 3 hours

**Task 3.3:** Create preferences React page
- Build `/settings/reminders` page with all sections
- Form state management with React hooks
- API integration with useEffect + fetch
- Save button with loading/error states
- Complexity: **Medium**
- Effort: 8 hours

**Task 3.4:** Implement quiet hours filtering
- Update ReminderService.send() to check quiet hours
- Don't send during quiet window (queue for next allowed time)
- Respect user's timezone
- Complexity: **Low**
- Effort: 2 hours

### Phase 4: Reminder Management Endpoints (Week 2-3)

**Task 4.1:** Implement snooze/dismiss/undo endpoints
- `POST /api/reminders/:id/snooze` with durationHours param
- `POST /api/reminders/:id/dismiss` with optional reason
- `POST /api/reminders/:id/undo-dismiss`
- Unit tests
- Complexity: **Low**
- Effort: 2 hours

**Task 4.2:** Implement custom reminder creation
- `POST /api/reminders` to create user-set reminders
- Validate scheduledFor is in future
- Create Bull job or cron entry
- Complexity: **Medium**
- Effort: 3 hours

**Task 4.3:** Implement reminder list endpoint
- `GET /api/reminders?status=pending&type=stuck_clarification&page=1&limit=20`
- Return paginated list
- Support filtering by status, type, taskId
- Complexity: **Low**
- Effort: 2 hours

**Task 4.4:** Implement reminder summary endpoint
- `GET /api/reminders/summary` for dashboard widget
- Return pending count, snoozed count, overdue tasks
- Complexity: **Low**
- Effort: 2 hours

### Phase 5: Frontend UI Components (Week 3)

**Task 5.1:** Build Notification Bell component
- Bell icon with badge count in navbar
- Dropdown showing 10 recent reminders
- Click reminder → navigate to task
- Snooze/dismiss buttons in dropdown
- Complexity: **Medium**
- Effort: 4 hours

**Task 5.2:** Create ReminderRow component for lists
- Display reminder type icon, title, age
- Quick action buttons (snooze, dismiss, view)
- Complexity: **Low**
- Effort: 2 hours

**Task 5.3:** Add reminders widget to dashboard
- Display top 5 overdue reminders
- Color coding by age (green/yellow/red)
- Link to task detail
- Auto-refresh every 30 seconds
- Complexity: **Low**
- Effort: 3 hours

**Task 5.4:** Enhance task detail page
- Add reminder snooze/mute controls
- Show reminder history for task
- Complexity: **Medium**
- Effort: 3 hours

### Phase 6: Testing & Polish (Week 3-4)

**Task 6.1:** Write unit tests for ReminderService
- Test createReminder(), snooze(), dismiss()
- Test evaluateCondition() for each reminder type
- Test quiet hours filtering
- Mock email/Slack services
- Complexity: **High**
- Effort: 8 hours

**Task 6.2:** Write integration tests for API endpoints
- Test full reminder lifecycle (create → send → snooze → dismiss)
- Test preference updates
- Test email/Slack sending
- Complexity: **High**
- Effort: 6 hours

**Task 6.3:** Frontend component tests (Vitest)
- Test NotificationBell component
- Test ReminderRow with actions
- Test preferences form validation
- Complexity: **Medium**
- Effort: 6 hours

**Task 6.4:** Performance & scalability review
- Review indexes, query performance
- Test with large number of reminders
- Optimize polling interval
- Document scaling recommendations
- Complexity: **Medium**
- Effort: 4 hours

**Task 6.5:** Documentation
- Write API documentation
- Write developer guide (adding new reminder types)
- Write user guide for settings page
- Complexity: **Low**
- Effort: 3 hours

---

## 13. Estimated Complexity

### Service Layer
| Component | Complexity | Effort | Notes |
|---|---|---|---|
| Reminder schema | Low | 1 hour | Standard Mongoose schema |
| ReminderService | Medium | 6 hours | Multiple methods, event handling |
| Cron scheduler | Medium | 3 hours | Error handling, graceful shutdown |
| Email delivery | Medium | 6 hours | Templates, retry logic |
| Slack delivery | Medium | 4 hours | Slack API, message formatting |
| UserPreferences | Low | 3 hours | CRUD operations |
| Digest generation | Medium | 4 hours | Grouping, sorting, templating |

### API Layer
| Component | Complexity | Effort | Notes |
|---|---|---|---|
| Reminders controller | Low | 3 hours | Standard REST endpoints |
| Preferences controller | Low | 3 hours | CRUD operations |
| Summary endpoint | Low | 2 hours | Aggregation query |

### Frontend Layer
| Component | Complexity | Effort | Notes |
|---|---|---|---|
| Settings page | Medium | 8 hours | Many form inputs, validation |
| Notification Bell | Medium | 4 hours | Dropdown, real-time updates |
| Dashboard widget | Low | 3 hours | Simple list and styling |
| Task detail enhancement | Medium | 3 hours | Add controls, integrate API |

### Testing
| Layer | Complexity | Effort | Notes |
|---|---|---|---|
| Unit tests (service) | High | 8 hours | Multiple code paths |
| Integration tests (API) | High | 6 hours | External service mocks |
| Frontend tests | Medium | 6 hours | Component isolation |

### Total Estimated Effort: **~100 hours** (2-3 weeks with 1 FTE)

**Breakdown:**
- Backend services: 30 hours
- API layer: 10 hours
- Email/Slack integration: 10 hours
- Frontend pages: 15 hours
- Testing: 20 hours
- Documentation: 5 hours
- Buffer: 10 hours

---

## 14. Configuration Examples

### .env.example additions

```bash
# Reminders
REMINDER_CRON_ENABLED=true
REMINDER_CHECK_INTERVAL=60000  # 1 minute
REMINDER_QUIET_HOURS_ENABLED=false
REMINDER_EMAIL_PROVIDER=sendgrid  # sendgrid | nodemailer
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=reminders@ai-pipeline.up.railway.app

# Slack
SLACK_INTERACTIVE_URL=https://ai-pipeline.up.railway.app/api/webhooks/slack/interactive

# Redis (optional, for Bull queue)
REDIS_URL=redis://localhost:6379
```

### Example UserPreference Document

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "userId": "user_123",
  "channels": {
    "inApp": true,
    "email": true,
    "slack": true
  },
  "reminders": {
    "stuckClarification": true,
    "prReviewReady": true,
    "prOpenTooLong": true,
    "failedTasks": true,
    "customReminders": true
  },
  "thresholds": {
    "clarificationDelayHours": 24,
    "prOpenDaysThreshold": 3,
    "prReviewReminderIntervalHours": 48
  },
  "digest": {
    "enabled": true,
    "frequency": "daily",
    "time": "09:00",
    "timezone": "America/New_York",
    "categories": ["stuck_clarification", "pr_review", "task_failed"]
  },
  "quietHours": {
    "enabled": true,
    "startTime": "18:00",
    "endTime": "08:00",
    "timezone": "America/New_York"
  },
  "repoPreferences": {
    "mothership/finance-service": {
      "enabled": true,
      "channels": ["in-app", "slack"],
      "customThresholds": {
        "clarificationDelayHours": 12
      }
    },
    "mothership/compliance-service": {
      "enabled": false
    }
  },
  "createdAt": ISODate("2026-02-01T10:00:00Z"),
  "updatedAt": ISODate("2026-02-15T14:30:00Z")
}
```

### Example Reminder Document (Stuck Clarification)

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "userId": "user_123",
  "taskId": ObjectId("507f1f77bcf86cd799438888"),
  "type": "stuck_clarification",
  "title": "Task waiting for clarification: Fix payment webhook",
  "description": null,
  "scheduledFor": ISODate("2026-02-16T10:00:00Z"),
  "nextRecurrenceAt": ISODate("2026-02-17T10:00:00Z"),
  "status": "pending",
  "sentAt": null,
  "payload": {
    "taskTitle": "Fix payment webhook handler",
    "taskDescription": "Payment status not updating after Stripe webhook",
    "clarificationAge": 24,
    "questions": [
      "What is the current payment status when webhook fires?"
    ]
  },
  "snoozeUntil": null,
  "snoozeCount": 0,
  "dismissedAt": null,
  "dismissReason": null,
  "recurrenceCount": 0,
  "maxRecurrences": 7,
  "failureCount": 0,
  "sentVia": [],
  "metadata": {
    "source": "auto",
    "createdByEvent": "task.status_changed"
  },
  "createdAt": ISODate("2026-02-16T10:00:00Z"),
  "updatedAt": ISODate("2026-02-16T10:00:00Z")
}
```

---

## 15. Future Enhancements (Post-MVP)

1. **Escalation Rules** — Auto-escalate to manager if task overdue by X days
2. **Team Reminders** — Remind team members assigned to PR to review
3. **Metrics Dashboard** — Track reminder effectiveness (snooze/dismiss rates)
4. **Smart Timing** — Send reminders at user's most active hours (based on analytics)
5. **Reminder Aggregation** — Group similar reminders (e.g., multiple PRs overdue)
6. **Webhook Notifications** — Send reminders to custom webhooks (Slack App, Teams, etc.)
7. **AI-Powered Suggestions** — LLM suggests optimal reminder schedules based on task type
8. **Predictive Reminders** — Alert before task is likely to become stuck
9. **Mobile App Notifications** — Push notifications on mobile
10. **Calendar Integration** — Add reminders to Google Calendar / Outlook

---

## 16. Security & Privacy Considerations

1. **User Data** — Reminders contain task details; ensure user.createdBy is enforced
2. **Email Leakage** — Never include API keys, secrets, or internal URLs in email
3. **Unsubscribe Links** — Must be secure and one-click (comply with CAN-SPAM)
4. **Quiet Hours Timezone** — Support any IANA timezone; validate input
5. **Snoozed Reminder Expiry** — Clean up very old snoozed reminders (30+ days)
6. **Rate Limiting** — Prevent reminder spam: max 10 reminders per user per hour
7. **Audit Logging** — Log all snooze/dismiss actions for compliance
8. **GDPR Compliance** — User can export/delete all their reminders

---

## 17. Testing Checklist

### Unit Tests
- [ ] ReminderService.createReminder() with all reminder types
- [ ] ReminderService.evaluateCondition() for each type
- [ ] ReminderService.snooze() and snooze expiry
- [ ] ReminderService.dismiss() and re-evaluation
- [ ] UserPreferenceService.getPreferences() with defaults
- [ ] Quiet hours filtering (various timezones)
- [ ] Email template rendering
- [ ] Slack message formatting

### Integration Tests
- [ ] Create task → auto-create stuck_clarification reminder at 24h
- [ ] Create PR → auto-create pr_review reminder
- [ ] Set custom reminder → triggers at scheduled time
- [ ] Snooze reminder → re-evaluates on snooze expiry
- [ ] Email sent successfully with all channels
- [ ] Slack DM with interactive buttons
- [ ] Preferences persisted and applied

### E2E Tests
- [ ] User creates task → sees in-app reminder after 24h
- [ ] User snoozes → reminder re-appears after 24h
- [ ] User dismisses → reminder doesn't re-appear (unless task state changes)
- [ ] User sets quiet hours → no emails during quiet window
- [ ] User changes repo preference → reminders respect override
- [ ] Custom reminder → triggers at exact time

---

## 18. Deployment Checklist

- [ ] Database migrations run (create collections, indexes)
- [ ] Environment variables set (SENDGRID_API_KEY, SLACK_BOT_TOKEN, etc.)
- [ ] Cron job enabled and tested (check logs)
- [ ] Email service configured and tested
- [ ] Slack integration tested (send test DM)
- [ ] Frontend build includes new components and pages
- [ ] API endpoints documented in README
- [ ] Monitoring/alerting set up for reminder queue
- [ ] Rate limiting configured
- [ ] Backup strategy for reminders data

---

## 19. References

- [NestJS Task Scheduling](https://docs.nestjs.com/techniques/task-scheduling)
- [Mongoose Indexing](https://mongoosejs.com/docs/api/schema.html#Schema.prototype.index())
- [Bull Queue (Redis-backed job queue)](https://docs.bullmq.io/)
- [SendGrid Email API](https://docs.sendgrid.com/api-reference)
- [Slack API Messaging](https://api.slack.com/methods/chat.postMessage)
- [IANA Timezone Database](https://www.iana.org/time-zones)
- [CAN-SPAM Compliance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide)
