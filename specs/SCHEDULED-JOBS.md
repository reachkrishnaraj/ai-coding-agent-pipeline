# Scheduled Jobs — Requirements Specification

**Version:** 1.0
**Date:** 2026-02-15
**Status:** Open for Review
**System:** AI Pipeline (NestJS + React + MongoDB)

---

## 1. Overview

### Problem Statement

The AI Pipeline system currently lacks background job processing capabilities, which are essential for:

1. **Data consistency**: Tasks can become stuck in intermediate states (e.g., `analyzing`, `dispatched`) if the agent crashes, hangs, or network fails
2. **External system synchronization**: GitHub PR statuses, Slack message updates, and third-party webhook events require periodic polling since webhooks are not always reliable
3. **System hygiene**: Expired sessions, old logs, and temporary data accumulate without automatic cleanup
4. **Business intelligence**: Analytics on task completion rates, agent performance, and system reliability require aggregated daily/weekly statistics
5. **Operational resilience**: Failed LLM calls, API timeouts, and GitHub rate limits need automatic retry logic with exponential backoff

### Objective

Implement a robust, scalable job scheduling system that:

- Runs background jobs on a configurable schedule (cron-based)
- Automatically retries failed jobs with exponential backoff
- Provides visibility into job execution history, failures, and metrics
- Scales horizontally (multiple workers can process jobs concurrently)
- Integrates cleanly with existing NestJS modules without disrupting the core task API
- Supports both time-based and event-based job triggers

---

## 2. Job Types Needed

### 2.1 Stale Task Cleanup

**Purpose**: Identify and escalate tasks stuck in intermediate states

**Trigger**: Daily at 2:00 AM UTC

**Job Interval**: 1 day

**Execution**:
1. Query tasks with `status` in `['analyzing', 'needs_clarification', 'dispatched']` and `updatedAt < now - 24 hours`
2. For each stale task:
   - Log a warning event
   - Attempt to fetch the GitHub issue status (if `githubIssueNumber` exists)
   - If GitHub issue shows the PR is merged, transition task to `merged`
   - If GitHub issue is closed without a PR, transition task to `failed` with error message
   - Otherwise, set task to `needs_escalation` status and notify ops team via Slack

**Retry Policy**: 2 retries with 5-minute exponential backoff

**Concurrency**: 1 (sequential, to avoid race conditions on status updates)

**Expected Runtime**: < 30 seconds

**Success Condition**: All stale tasks reviewed; escalation messages sent


### 2.2 PR Status Sync

**Purpose**: Keep task PR status in sync with GitHub

**Trigger**: Every 10 minutes

**Job Interval**: 10 minutes

**Execution**:
1. Query tasks with `status === 'pr_open'` and `githubPrNumber` set
2. For each PR:
   - Call GitHub API: `GET /repos/{owner}/{repo}/pulls/{number}`
   - Compare local `githubPrStatus` with GitHub's actual status
   - If statuses differ:
     - Update task's `githubPrStatus` and `githubPrUpdatedAt`
     - Log a sync event with the change details
   - If PR is merged:
     - Transition task to `merged`
     - Record `completedAt` timestamp
     - Log completion event

**Retry Policy**: 3 retries with 30-second exponential backoff (respect GitHub rate limits)

**Concurrency**: 5 (parallel API calls, but respect GitHub rate limits with sliding window)

**Expected Runtime**: < 2 minutes (for 500 open PRs)

**Success Condition**: All open PRs polled and synced; rate limit not exceeded

**Error Handling**:
- If GitHub rate limit exceeded: skip remaining PRs, reschedule job in 1 hour
- If PR API call fails: log error, continue to next PR, mark job as partially failed


### 2.3 Retry Failed Tasks

**Purpose**: Automatically retry failed LLM analysis, GitHub issue creation, or other transient failures

**Trigger**: Every 30 minutes

**Job Interval**: 30 minutes

**Execution**:
1. Query tasks with `status === 'failed'` and `retryCount < maxRetries` (default: 3)
2. For each failed task:
   - Examine `failureReason` to determine root cause:
     - If `LLM_API_ERROR` or `RATE_LIMITED`: re-submit to LLM service (status back to `analyzing`)
     - If `GITHUB_API_ERROR`: retry GitHub issue creation (status back to `dispatched`)
     - If `TRANSIENT_ERROR`: retry the last failed operation
     - Otherwise: keep task in `failed` state (manual intervention needed)
   - Increment `retryCount`
   - Reset `updatedAt` to trigger processing
   - Log retry attempt with backoff delay in exponential form: `delay = 5 * (2 ^ retryCount)` minutes

**Retry Policy**: Inherent to the job (task-level retries); job itself retries 2 times if execution fails

**Concurrency**: 3

**Expected Runtime**: < 1 minute (for 50 failed tasks)

**Success Condition**: All retryable tasks re-queued; retry counts incremented


### 2.4 Analytics Aggregation

**Purpose**: Generate daily and weekly analytics for dashboards and reporting

**Triggers**:
- Daily at 3:00 AM UTC (for daily stats)
- Weekly at 3:00 AM UTC on Sundays (for weekly stats)

**Job Intervals**: 1 day, 1 week

**Execution**:

#### Daily Analytics
1. Calculate metrics for the past 24 hours:
   - Total tasks created
   - Tasks completed (moved to `merged`)
   - Tasks failed
   - Average time-to-merge
   - Average LLM analysis time
   - Most common task types
   - Most common repos
   - Most active agents (by issue count)
2. Insert or update document in `analytics_daily` collection:
   ```
   {
     date: ISODate,
     tasksCreated: number,
     tasksCompleted: number,
     tasksFailed: number,
     avgTimeToMerge: number (minutes),
     avgLlmAnalysisTime: number (seconds),
     taskTypeBreakdown: { bug_fix: n, feature: n, ... },
     repoBreakdown: { 'finance-service': n, ... },
     agentBreakdown: { 'claude-code': n, ... }
   }
   ```
3. Optionally alert if failure rate exceeds threshold (e.g., > 5%)

#### Weekly Analytics
1. Aggregate the past 7 daily documents to calculate:
   - Total tasks created (week)
   - Total tasks completed (week)
   - Week-over-week trend (if previous week exists)
   - Most common task types
   - Most common repos
   - Top performing agents (highest completion rate)
2. Insert or update document in `analytics_weekly` collection with similar structure

**Retry Policy**: 1 retry with 10-minute backoff

**Concurrency**: 1 (sequential aggregation)

**Expected Runtime**: < 10 seconds

**Success Condition**: Analytics documents created/updated; no data loss


### 2.5 Session Cleanup

**Purpose**: Remove expired user sessions from the database

**Trigger**: Daily at 4:00 AM UTC

**Job Interval**: 1 day

**Execution**:
1. Query `sessions` collection for documents with `expiresAt < now` (or `expires < now` depending on session library)
2. Delete all expired session documents
3. Log deletion count
4. Optionally run MongoDB `deleteMany` with bulk operation for efficiency

**Retry Policy**: 2 retries with 5-minute backoff

**Concurrency**: 1

**Expected Runtime**: < 5 seconds

**Success Condition**: All expired sessions deleted


---

## 3. Technical Approach

### 3.1 Decision: Bull/BullMQ with Redis

**Recommendation**: **BullMQ with Redis** (using optional Railway plugin)

**Rationale**:
1. **Cron-based scheduling**: BullMQ has native cron expression support (`repeat: { cron: '0 2 * * *' }`)
2. **Reliable job persistence**: Jobs stored in Redis (durable, fast)
3. **Scalability**: Multiple worker processes can consume jobs from Redis
4. **Community**: Large ecosystem, many examples, active maintenance
5. **DX**: Clean NestJS integration via `@nestjs/bull` (though BullMQ is moving away from `@nestjs/bull`)
6. **Monitoring**: Built-in job history, failed jobs queue, Redis CLI visibility
7. **Rate limiting**: Native backoff and retry policies
8. **Dead letter queue**: Failed jobs can be moved to a special queue for manual intervention

**Alternative Considered: Agenda**
- Pros: Uses MongoDB directly (no external Redis needed)
- Cons: Less performant for high job volumes; less mature than BullMQ
- Decision: Rejected due to scalability concerns and Redis already used for sessions/caching

**Alternative Considered: node-cron**
- Pros: Simple, no external dependency
- Cons: Single-process only; no job persistence; no retry logic; no distributed lock support
- Decision: Rejected for lack of scalability and reliability

---

### 3.2 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    AI Pipeline App (NestJS)                  │
│                                                               │
│  ┌────────────────────┐         ┌─────────────────────────┐  │
│  │   API Server       │         │  Job Scheduler Module   │  │
│  │  (main process)    │────────▶│  (separate worker)      │  │
│  │                    │         │                         │  │
│  │ - REST API         │         │ - BullMQ Queues        │  │
│  │ - Web UI           │         │ - Job Processors       │  │
│  │ - Webhook Handler  │         │ - Cron Triggers        │  │
│  └────────────────────┘         └──────┬──────────────────┘  │
│                                        │                      │
│                                        ▼                      │
│                              ┌──────────────────┐             │
│                              │  MongoDB         │             │
│                              │  - tasks         │             │
│                              │  - analytics     │             │
│                              │  - job_history   │             │
│                              └──────────────────┘             │
└──────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────┐
│                        Redis (Railway)                        │
│                                                               │
│  - BullMQ Queues (stale-cleanup, pr-sync, retry, etc.)      │
│  - Job Metadata (status, progress, history)                 │
│  - Retry Backoff (exponential delays)                       │
└──────────────────────────────────────────────────────────────┘
```

**Design Principles**:
1. Jobs are enqueued in Redis, processed by worker threads
2. Worker threads update MongoDB with job results
3. Job history is logged to MongoDB `job_history` collection for audit trail
4. Failed jobs are moved to a dead letter queue for manual review
5. Multiple worker processes can run on the same or different servers

---

## 4. Job Configuration

### 4.1 Cron Expressions (CRON Format)

All cron expressions use standard Unix cron format: `minute hour day-of-month month day-of-week`

| Job | Cron Expression | Description |
|-----|-----------------|-------------|
| Stale Task Cleanup | `0 2 * * *` | Daily at 2:00 AM UTC |
| PR Status Sync | `*/10 * * * *` | Every 10 minutes |
| Retry Failed Tasks | `*/30 * * * *` | Every 30 minutes |
| Daily Analytics | `0 3 * * *` | Daily at 3:00 AM UTC |
| Weekly Analytics | `0 3 * * 0` | Weekly at 3:00 AM UTC on Sunday |
| Session Cleanup | `0 4 * * *` | Daily at 4:00 AM UTC |

### 4.2 Retry Policies

**Global Retry Configuration**:
```javascript
{
  attempts: 3,              // Total retry attempts
  backoff: {
    type: 'exponential',
    delay: 5000             // Initial delay: 5 seconds
                            // 2nd retry: 10 seconds
                            // 3rd retry: 20 seconds
  }
}
```

**Job-Specific Overrides**:

| Job | Attempts | Initial Delay | Type |
|-----|----------|--------------|------|
| Stale Task Cleanup | 2 | 5 min | exponential |
| PR Status Sync | 3 | 30 sec | exponential |
| Retry Failed Tasks | 2 | 5 min | exponential |
| Daily Analytics | 1 | 10 min | exponential |
| Session Cleanup | 2 | 5 min | exponential |

**Backoff Formula**: `delay = initialDelay * (2 ^ attemptNumber)`

### 4.3 Concurrency Limits

| Job | Concurrency | Rationale |
|-----|-------------|-----------|
| Stale Task Cleanup | 1 | Avoid race conditions on task status updates |
| PR Status Sync | 5 | Parallel GitHub API calls, but respect rate limits |
| Retry Failed Tasks | 3 | Balance between throughput and system load |
| Daily Analytics | 1 | Aggregation must be atomic |
| Weekly Analytics | 1 | Aggregation must be atomic |
| Session Cleanup | 1 | Database cleanup should be sequential |

### 4.4 Timeout Configuration

All jobs must specify a maximum execution time to prevent hanging:

| Job | Timeout | Rationale |
|-----|---------|-----------|
| Stale Task Cleanup | 2 minutes | Should complete in < 30 seconds normally |
| PR Status Sync | 5 minutes | Batch API calls may take 2 minutes for large volume |
| Retry Failed Tasks | 3 minutes | LLM calls may take time |
| Daily Analytics | 1 minute | Should complete in < 10 seconds normally |
| Weekly Analytics | 2 minutes | Aggregation of 7 days may take time |
| Session Cleanup | 30 seconds | Simple database delete |

---

## 5. Job Monitoring

### 5.1 Job History Storage (MongoDB)

Create a new `job_history` collection to track all job executions:

```javascript
{
  _id: ObjectId,
  jobName: string,           // e.g., "stale-task-cleanup"
  jobId: string,             // BullMQ job ID
  queueName: string,         // e.g., "scheduled-jobs"
  status: 'pending' | 'active' | 'completed' | 'failed',
  startedAt: ISODate,
  completedAt: ISODate,
  durationMs: number,        // Duration in milliseconds
  result: {                  // Job-specific result
    tasksProcessed: number,
    tasksUpdated: number,
    errors: string[]
  },
  error: {                   // If status === 'failed'
    message: string,
    stack: string,
    code: string             // 'TIMEOUT', 'RATE_LIMITED', etc.
  },
  retryCount: number,
  nextRetryAt: ISODate,
  progress: number,          // 0-100 percent
  logs: [                    // Optional structured logs
    {
      level: 'info' | 'warn' | 'error',
      timestamp: ISODate,
      message: string,
      context: object
    }
  ]
}
```

**Indexes**:
- `{ jobName: 1, completedAt: -1 }` — Query recent executions by job name
- `{ status: 1, completedAt: -1 }` — Filter by status and recency
- `{ completedAt: -1 }` — TTL index (auto-delete after 90 days)

### 5.2 Redis Monitoring (Built-in BullMQ)

Use Redis CLI or BullMQ UI to monitor:

```bash
# Check queue status
redis-cli XLEN bull:stale-task-cleanup:0

# View job count by status
redis-cli --eval bullmq-monitor.lua
```

### 5.3 Admin API Endpoints

**Endpoints for job monitoring** (optional, but recommended):

```
GET /api/admin/jobs/queues
  Returns list of queues with job counts by status

GET /api/admin/jobs/queues/{queueName}
  Returns detailed queue status, active jobs, failed jobs

GET /api/admin/jobs/history?limit=50&status=failed
  Query job execution history from job_history collection

GET /api/admin/jobs/{jobId}
  Get detailed status of a specific job

POST /api/admin/jobs/{jobId}/retry
  Manually retry a failed job

POST /api/admin/jobs/{queueName}/pause
  Pause a queue (stop processing new jobs)

POST /api/admin/jobs/{queueName}/resume
  Resume processing

POST /api/admin/jobs/{jobId}/cancel
  Cancel a pending or active job
```

**Security**: These endpoints should require `admin` role and HTTPS

### 5.4 Real-time Monitoring (Optional)

Use Redis Streams and WebSocket to push job status updates to dashboard:

```typescript
// Example: WebSocket event for job completion
{
  type: 'job:completed',
  jobId: string,
  jobName: string,
  completedAt: ISO8601,
  result: object,
  durationMs: number
}
```

---

## 6. Admin UI Dashboard (Optional, Phase 2)

### 6.1 Dashboard Layout

**Location**: `/admin/jobs` (requires authentication + admin role)

**Sections**:

1. **Queue Overview Card**
   - Show all queues
   - Active job count
   - Failed job count
   - Pending job count
   - Last execution time per queue

2. **Job Execution Timeline**
   - Last 24 hours of job executions
   - Color-coded by status (green = success, red = failed, yellow = in progress)
   - Click to see detailed logs

3. **Job History Table**
   - Filterable by job name, status, date range
   - Columns: Job Name, Status, Started At, Duration, Retry Count, Result
   - Sortable

4. **Failed Jobs Queue**
   - List of failed jobs awaiting manual intervention
   - Option to retry or dismiss

5. **Job Details Modal**
   - Full execution logs (structured)
   - Error stack trace
   - Result payload
   - Manual retry button

### 6.2 Implementation Notes

- Use React Query for data fetching
- Implement auto-refresh every 10 seconds
- Use charts library (e.g., recharts) for timeline visualization
- Add filters for date range, job name, status

---

## 7. Database Changes

### 7.1 New MongoDB Collections

#### `job_history` Collection

Already defined above in Section 5.1.

#### `analytics_daily` Collection

```javascript
{
  _id: ObjectId,
  date: ISODate,             // Date at midnight UTC
  tasksCreated: number,
  tasksCompleted: number,
  tasksFailed: number,
  avgTimeToMerge: number,    // in minutes
  avgLlmAnalysisTime: number,// in seconds
  taskTypeBreakdown: {
    'bug-fix': number,
    'feature': number,
    'refactor': number,
    'test-coverage': number
  },
  repoBreakdown: {
    'mothership/finance-service': number,
    'mothership/auth-service': number,
    // ...
  },
  agentBreakdown: {
    'claude-code': number,
    'codex': number,
    'copilot': number
  },
  failureRate: number,       // percentage 0-100
  createdAt: ISODate
}
```

**Indexes**:
- `{ date: -1 }` — Sort by date descending

#### `analytics_weekly` Collection

```javascript
{
  _id: ObjectId,
  weekStart: ISODate,        // Monday of week at midnight UTC
  weekEnd: ISODate,
  tasksCreated: number,
  tasksCompleted: number,
  tasksFailed: number,
  // ... (same fields as daily)
  weekOverWeekTrend: {
    tasksCreatedChange: number, // percentage
    completionRateChange: number,
    avgTimeToMergeChange: number
  },
  createdAt: ISODate
}
```

### 7.2 Schema Modifications to Existing Collections

#### `tasks` Collection

Add these fields:
```javascript
{
  // ... existing fields
  retryCount: { type: Number, default: 0 },        // For retry-failed-tasks job
  failureReason: string,                           // Enum: LLM_API_ERROR, GITHUB_API_ERROR, TRANSIENT_ERROR, etc.
  needsEscalation: Boolean,                        // Set by stale-task-cleanup job
  githubPrUpdatedAt: ISODate,                      // Last sync time from PR status job
  analyticsExclude: Boolean                        // If true, skip this task in analytics aggregation
}
```

---

## 8. Infrastructure

### 8.1 Redis Requirement

**Service**: Railway Redis Add-on or local Redis (development)

**Configuration**:

```env
# .env
REDIS_URL=redis://default:<password>@<host>:<port>

# .env.example
REDIS_URL=redis://default:password@localhost:6379
```

**Database**: Use default DB 0 for BullMQ queues; optionally use DB 1 for session store

**Size**: Start with 512 MB plan on Railway; scale to 1 GB if processing > 1000 jobs/day

### 8.2 Redis Data Persistence

Configure Redis persistence:

```
save 900 1       # Save if at least 1 key changed in 15 minutes
save 300 10      # Save if at least 10 keys changed in 5 minutes
save 60 10000    # Save if at least 10000 keys changed in 60 seconds
appendonly yes   # Enable AOF persistence
```

**Rationale**: Prevents job loss if Redis restarts

### 8.3 Memory Management

```
maxmemory 512mb
maxmemory-policy allkeys-lru  # Evict least recently used keys if max memory exceeded
```

### 8.4 Deployment

**Single Machine Deployment**:
- Run API server and job workers in the same container (PM2 or node-schedule)
- Easier to manage, simpler for MVP

**Distributed Deployment** (optional, Phase 2):
- API server: 1-N instances (stateless)
- Job workers: 1-N instances (state shared via Redis)
- Load balancer directs traffic to API servers
- Each worker subscribes to same Redis queues

---

## 9. Error Handling

### 9.1 Failed Job Notifications

**Strategy**: Use Slack to notify ops team of failed jobs

**Implementation**:

```typescript
// In job error handler
if (job.attemptsMade >= job.opts.attempts) {
  // All retries exhausted
  await slackService.notify({
    channel: process.env.SLACK_OPS_CHANNEL,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Job Failed After Retries*\n`
                + `Job: ${job.name}\n`
                + `Error: ${job.failedReason}\n`
                + `Retries: ${job.attemptsMade}\n`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Details' },
            url: `${appUrl}/admin/jobs/${job.id}`
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Retry' },
            action_id: `job_retry_${job.id}`
          }
        ]
      }
    ]
  });
}
```

### 9.2 Dead Letter Queue

**Strategy**: Move failed jobs to separate DLQ for manual review

**Implementation**:

```typescript
// BullMQ setup
const queue = new Queue('scheduled-jobs', {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }
  }
});

// Listen for failed jobs
queue.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    // Move to DLQ
    await dlqQueue.add(job.name, job.data, {
      ...job.opts,
      attempts: 0  // Don't retry
    });
  }
});
```

### 9.3 Rate Limit Handling

**Strategy**: For PR Status Sync job, detect GitHub rate limit and reschedule gracefully

```typescript
// In PR sync job
try {
  const response = await githubClient.rest.pulls.get({
    owner: 'mothership',
    repo: repoName,
    pull_number: prNumber
  });
  // Process PR...
} catch (error) {
  if (error.status === 403 && error.message.includes('API rate limit')) {
    // Calculate reset time from response headers
    const resetTime = parseInt(error.response.headers['x-ratelimit-reset']) * 1000;
    const delayMs = resetTime - Date.now();

    // Reschedule job after rate limit reset
    await job.moveToDelayed(delayMs, true);
    throw error;  // Will retry after delay
  }
  throw error;
}
```

### 9.4 Logging and Alerting

**Log Levels**:
- `error`: Job execution failed after retries
- `warn`: Job execution failed but will retry; rate limit detected
- `info`: Job started/completed; state transition; retry attempt
- `debug`: Detailed operation logs (e.g., each PR polled)

**Alert Thresholds**:
- 5+ consecutive job failures → Page on-call engineer
- Job timeout (execution exceeds max time) → Critical alert
- Dead letter queue size > 10 → Warning alert
- Redis memory usage > 80% → Warning alert

---

## 10. Scalability

### 10.1 Multiple Workers

**Horizontal Scaling**:
1. Each server runs its own worker process
2. All workers connect to same Redis instance
3. BullMQ distributes jobs across workers automatically

**Docker Compose Example**:
```yaml
version: '3.8'
services:
  app:
    image: ai-pipeline:latest
    environment:
      - NODE_ENV=production
      - JOB_WORKERS_ENABLED=false  # Disable workers in API server
    ports:
      - "3000:3000"

  worker-1:
    image: ai-pipeline:latest
    environment:
      - NODE_ENV=production
      - JOB_WORKERS_ONLY=true      # Run only workers, no API

  worker-2:
    image: ai-pipeline:latest
    environment:
      - NODE_ENV=production
      - JOB_WORKERS_ONLY=true

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

### 10.2 Job Locking (Idempotency)

**Challenge**: If a long-running job (e.g., PR Status Sync) is interrupted, it might process the same PR twice

**Solution**: Use Redis locks for job processing

```typescript
// Pseudo-code
async function processPrStatusSync(job: Job) {
  const lockKey = `job:pr-sync:lock`;
  const lockValue = generateUUID();

  // Acquire lock (only one worker can have this lock)
  const acquired = await redis.set(lockKey, lockValue, 'NX', 'EX', 600);

  if (!acquired) {
    // Another worker is processing this job
    throw new Error('Job already being processed by another worker');
  }

  try {
    // Process PRs...
  } finally {
    // Release lock
    await redis.del(lockKey);
  }
}
```

### 10.3 Performance Optimization

**Queue Tuning**:
- Increase worker concurrency for I/O-heavy jobs (PR Sync: 5-10)
- Decrease concurrency for CPU-heavy jobs (Analytics: 1)
- Monitor Redis memory and adjust job retention policy

**Database Optimization**:
- Ensure indexes exist on `job_history.jobName`, `tasks.status`, etc.
- Use bulk operations (`insertMany`, `updateMany`) for batch updates
- Archive old job history records to separate collection after 90 days

**Network Optimization**:
- Batch GitHub API calls into bulk queries where possible
- Implement client-side rate limit handling (exponential backoff)
- Use connection pooling for database connections

---

## 11. Implementation Tasks

### Phase 1: Foundation (Weeks 1-2)

**Task 1.1**: Set up BullMQ and Redis integration
- Install `bullmq` and `@nestjs/bull` (or equivalent)
- Configure Redis connection in AppModule
- Create ScheduledJobsModule
- Write unit tests for queue initialization
- **Estimated Complexity**: Low
- **Story Points**: 3

**Task 1.2**: Design and implement job history schema + storage
- Create MongoDB `job_history` collection schema (Mongoose)
- Implement job event logger service
- Add job execution tracking to all job handlers
- Write tests for job history persistence
- **Estimated Complexity**: Low
- **Story Points**: 3

**Task 1.3**: Implement Session Cleanup job (simplest)
- Create job processor function
- Set cron trigger (daily at 4 AM)
- Implement retry logic with exponential backoff
- Add tests and monitoring
- **Estimated Complexity**: Low
- **Story Points**: 2

### Phase 2: Core Jobs (Weeks 3-4)

**Task 2.1**: Implement Stale Task Cleanup job
- Query tasks in intermediate states
- Sync with GitHub issue status
- Transition tasks to appropriate states
- Add comprehensive error handling
- Write integration tests with mock GitHub API
- **Estimated Complexity**: Medium
- **Story Points**: 5

**Task 2.2**: Implement PR Status Sync job
- Batch fetch PR statuses from GitHub
- Handle GitHub rate limits gracefully
- Update task PR status in MongoDB
- Add concurrency control (max 5 parallel requests)
- Add rate limit detection and backoff
- Write tests covering rate limit scenarios
- **Estimated Complexity**: Medium
- **Story Points**: 5

**Task 2.3**: Implement Retry Failed Tasks job
- Identify failed tasks by failure reason
- Transition tasks back to processing queues
- Increment retry count and track backoff
- Add logic to distinguish retryable vs. unrecoverable failures
- Write tests for retry logic
- **Estimated Complexity**: Medium
- **Story Points**: 4

### Phase 3: Analytics and Monitoring (Weeks 5-6)

**Task 3.1**: Implement Daily Analytics aggregation job
- Aggregate task metrics for past 24 hours
- Calculate breakdowns by type, repo, agent
- Store in `analytics_daily` collection
- Add alert thresholds for failure rates
- Write tests with sample data
- **Estimated Complexity**: Medium
- **Story Points**: 4

**Task 3.2**: Implement Weekly Analytics aggregation job
- Aggregate 7-day metrics
- Calculate week-over-week trends
- Store in `analytics_weekly` collection
- Create helper functions for trend calculation
- Write tests
- **Estimated Complexity**: Medium
- **Story Points**: 3

**Task 3.3**: Build Admin API for job monitoring
- Create `/api/admin/jobs/queues` endpoint
- Create `/api/admin/jobs/history` endpoint with filtering
- Create `/api/admin/jobs/{jobId}` endpoint
- Add admin authorization middleware
- Write API documentation
- Add tests with mock data
- **Estimated Complexity**: Medium
- **Story Points**: 5

### Phase 4: Dashboard and Deployment (Weeks 7-8)

**Task 4.1**: Build Admin Dashboard UI (React)
- Create `/admin/jobs` page with queue overview
- Build job history table with filtering/sorting
- Build job details modal with logs
- Implement real-time updates via WebSocket or polling
- Add dark/light theme support
- Write component tests
- **Estimated Complexity**: Medium
- **Story Points**: 8

**Task 4.2**: Add Slack notifications for failed jobs
- Implement notification service
- Configure Slack channel for ops alerts
- Add formatted blocks with retry button
- Test notification delivery
- **Estimated Complexity**: Low
- **Story Points**: 2

**Task 4.3**: Configure production Redis and deployment
- Set up Railway Redis add-on
- Update environment variables
- Configure Redis persistence settings
- Test failover and recovery
- Write deployment guide
- **Estimated Complexity**: Low
- **Story Points**: 3

**Task 4.4**: Load testing and optimization
- Simulate 1000+ jobs in queue
- Test PR sync with 500 open PRs
- Benchmark analytics aggregation
- Profile Redis memory usage
- Optimize based on results
- **Estimated Complexity**: Medium
- **Story Points**: 4

### Phase 5: Documentation and Handoff (Week 9)

**Task 5.1**: Write operational runbook
- Deploy procedures
- Troubleshooting guide
- Alert response playbooks
- Performance tuning guide
- **Estimated Complexity**: Low
- **Story Points**: 2

**Task 5.2**: Update system documentation
- Add scheduled jobs to architecture diagrams
- Update README with job types
- Add monitoring section to SPEC.md
- Update environment variables reference
- **Estimated Complexity**: Low
- **Story Points**: 2

---

## 12. Estimated Complexity

### By Component

| Component | Complexity | Rationale |
|-----------|-----------|-----------|
| BullMQ Setup | Low | Standard NestJS integration, minimal custom code |
| Job History Storage | Low | Simple MongoDB schema, straightforward queries |
| Session Cleanup Job | Low | Minimal business logic, standard MongoDB delete |
| Stale Task Cleanup Job | Medium | Requires state transitions, GitHub API calls, error handling |
| PR Status Sync Job | Medium | Batch GitHub API calls, rate limit handling, concurrency control |
| Retry Failed Tasks Job | Medium | Conditional logic based on failure reason, retry tracking |
| Daily Analytics | Medium | Aggregation pipeline, multiple groupings, threshold calculations |
| Weekly Analytics | Medium | Similar to daily, plus trend calculations |
| Admin API | Medium | Multiple endpoints, authorization, data transformation |
| Admin Dashboard | Medium | React components, real-time updates, filtering/sorting |
| Slack Notifications | Low | Simple message formatting, Slack SDK integration |
| Production Deployment | Low | Standard Railway setup, environment variables |
| Load Testing | Medium | Requires custom test scenarios, profiling tools |

### Overall Project Complexity

**Expected**: **Medium** (4-8 weeks for one engineer)

**Risk Factors**:
- GitHub API rate limits (mitigated by graceful backoff)
- MongoDB aggregation performance (mitigated by indexing)
- Redis memory pressure (mitigated by job retention policy)
- Distributed job locking (mitigated by single-worker designs for critical jobs)

**Mitigation**:
- Start with Phase 1 (foundation + simple job)
- Test each job in staging before production deployment
- Monitor Redis/MongoDB metrics closely in first week
- Have rollback plan (disable jobs via feature flags)

---

## 13. Appendix: Code Skeleton

### 13.1 BullMQ Module Setup

```typescript
// src/jobs/jobs.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';

import { SessionCleanupProcessor } from './processors/session-cleanup.processor';
import { StaleTaskCleanupProcessor } from './processors/stale-task-cleanup.processor';
import { PrStatusSyncProcessor } from './processors/pr-status-sync.processor';
import { RetryFailedTasksProcessor } from './processors/retry-failed-tasks.processor';
import { AnalyticsAggregationProcessor } from './processors/analytics-aggregation.processor';

import { JobHistoryService } from './services/job-history.service';
import { JobSchedulerService } from './services/job-scheduler.service';
import { JobsAdminController } from './controllers/jobs-admin.controller';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          url: config.get('REDIS_URL'),
          maxRetriesPerRequest: null,
          enableReadyCheck: false
        }
      })
    }),
    BullModule.registerQueue(
      { name: 'scheduled-jobs' },
      { name: 'stale-task-cleanup' },
      { name: 'pr-status-sync' },
      { name: 'retry-failed-tasks' },
      { name: 'analytics-aggregation' },
      { name: 'session-cleanup' }
    )
  ],
  providers: [
    SessionCleanupProcessor,
    StaleTaskCleanupProcessor,
    PrStatusSyncProcessor,
    RetryFailedTasksProcessor,
    AnalyticsAggregationProcessor,
    JobHistoryService,
    JobSchedulerService
  ],
  controllers: [JobsAdminController],
  exports: [JobSchedulerService, JobHistoryService]
})
export class JobsModule {}
```

### 13.2 Job Processor Example (Session Cleanup)

```typescript
// src/jobs/processors/session-cleanup.processor.ts
import { Processor, Process } from '@nestjs/bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, Queue } from 'bull';
import { Logger } from '@nestjs/common';

import { Session } from 'express-session';
import { JobHistoryService } from '../services/job-history.service';

@Processor('session-cleanup')
export class SessionCleanupProcessor {
  private readonly logger = new Logger(SessionCleanupProcessor.name);

  constructor(
    @InjectModel('Session') private sessionModel: Model<Session>,
    private jobHistoryService: JobHistoryService
  ) {}

  @Process()
  async handle(job: Job) {
    const startTime = Date.now();
    const jobName = 'session-cleanup';

    try {
      this.logger.log('Starting session cleanup job');

      const expiredSessions = await this.sessionModel.deleteMany({
        expiresAt: { $lt: new Date() }
      });

      const durationMs = Date.now() - startTime;

      await this.jobHistoryService.recordSuccess(job, {
        sessionsDeleted: expiredSessions.deletedCount,
        durationMs
      });

      this.logger.log(`Session cleanup completed: ${expiredSessions.deletedCount} sessions deleted`);
      return { success: true, sessionsDeleted: expiredSessions.deletedCount };
    } catch (error) {
      const durationMs = Date.now() - startTime;

      await this.jobHistoryService.recordFailure(job, {
        error: error.message,
        stack: error.stack,
        durationMs
      });

      this.logger.error(`Session cleanup failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
```

### 13.3 Job Scheduler Service

```typescript
// src/jobs/services/job-scheduler.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JobSchedulerService implements OnModuleInit {
  constructor(
    @InjectQueue('session-cleanup') private sessionCleanupQueue: Queue,
    @InjectQueue('stale-task-cleanup') private staleTaskCleanupQueue: Queue,
    @InjectQueue('pr-status-sync') private prStatusSyncQueue: Queue,
    @InjectQueue('retry-failed-tasks') private retryFailedTasksQueue: Queue,
    @InjectQueue('analytics-aggregation') private analyticsQueue: Queue,
    private configService: ConfigService
  ) {}

  async onModuleInit() {
    if (this.configService.get('JOB_WORKERS_ENABLED') !== 'false') {
      await this.scheduleAllJobs();
    }
  }

  async scheduleAllJobs() {
    // Session cleanup: daily at 4 AM UTC
    await this.sessionCleanupQueue.add(
      {},
      {
        repeat: { cron: '0 4 * * *', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 300000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 2
      }
    );

    // Stale task cleanup: daily at 2 AM UTC
    await this.staleTaskCleanupQueue.add(
      {},
      {
        repeat: { cron: '0 2 * * *', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 300000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 2
      }
    );

    // PR status sync: every 10 minutes
    await this.prStatusSyncQueue.add(
      {},
      {
        repeat: { cron: '*/10 * * * *', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3
      }
    );

    // Retry failed tasks: every 30 minutes
    await this.retryFailedTasksQueue.add(
      {},
      {
        repeat: { cron: '*/30 * * * *', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 300000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 2
      }
    );

    // Daily analytics: daily at 3 AM UTC
    await this.analyticsQueue.add(
      { type: 'daily' },
      {
        repeat: { cron: '0 3 * * *', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 600000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1
      }
    );

    // Weekly analytics: weekly at 3 AM UTC on Sunday
    await this.analyticsQueue.add(
      { type: 'weekly' },
      {
        repeat: { cron: '0 3 * * 0', tz: 'UTC' },
        backoff: { type: 'exponential', delay: 600000 },
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 1
      }
    );
  }
}
```

---

## 14. References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [NestJS Bull Integration](https://docs.nestjs.com/techniques/queues)
- [Redis Persistence](https://redis.io/docs/management/persistence/)
- [MongoDB Aggregation Pipeline](https://docs.mongodb.com/manual/reference/operator/aggregation/)
- [Cron Expression Format](https://crontab.guru/)
- [Slack Block Kit Reference](https://api.slack.com/block-kit)

---

## 15. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-15 | Claude Code | Initial specification |

---

**Status**: Open for Review
**Next Steps**:
1. Team review and feedback
2. Prioritize Phase 1 tasks
3. Assign engineer to Phase 1 (foundation)
4. Set up Redis instance on Railway
