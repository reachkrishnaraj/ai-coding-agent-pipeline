# REAL-TIME UPDATES Feature Specification

**Version:** 1.0
**Status:** Requirements Document
**Last Updated:** February 15, 2026

---

## 1. Overview

### Problem Statement

Currently, users must manually refresh the dashboard to see task status changes (e.g., task dispatched, PR opened, PR merged). This creates a poor user experience:

- Users don't know when their task progresses through the pipeline
- Users manually poll the dashboard, creating unnecessary server load
- Slack notifications provide some updates, but Web UI users miss immediate feedback
- Clarification Q&A responses and PR status changes require manual refresh

### Solution

Implement WebSocket-based real-time updates so users see task status changes, new PRs, and state transitions instantly without refreshing the page.

### Scope

**In Scope:**
- Task status changes (received → analyzing → needs_clarification → dispatched → coding → pr_open → merged)
- New PR creation and status updates (open → merged/closed)
- Clarification question delivery and answer submission
- Event timeline updates in task detail view
- Multiple connected users seeing updates simultaneously

**Out of Scope (v1):**
- Real-time Slack notifications (handled separately by webhooks)
- Real-time GitHub issue comment streaming
- Chat/messaging features
- Collaborative editing

---

## 2. User Stories

### Story 1: Dashboard Auto-Updates
**As a** Web UI user
**I want** the task dashboard to show updated statuses in real-time
**So that** I know immediately when my task progresses without refreshing

**Acceptance Criteria:**
- When a task status changes (e.g., → dispatched), connected dashboard users see the update within 500ms
- Status badge color changes match new status (pending yellow → dispatched green → merged blue)
- Task list order adjusts if sorting by timestamp
- Multiple users see the same update simultaneously

**Example:**
1. User A submits task "Fix payment bug"
2. User B viewing dashboard sees task appear in "analyzing" state
3. LLM analysis completes, task moves to "dispatched" with GitHub link
4. Both users see the status badge change instantly without refresh

---

### Story 2: PR Updates in Real-Time
**As a** Web UI user
**I want** to see when a PR is opened and when it's merged
**So that** I don't need to refresh or check GitHub separately

**Acceptance Criteria:**
- When GitHub webhook fires (PR opened), connected users see link within 1s
- When PR is merged, status changes to "merged" with merge commit info
- PR URL is clickable and opens GitHub in new tab
- Merge status indicator shows (merged/closed/draft)

**Example:**
1. User submits task → issue is created → user sees GitHub link
2. Agent starts working, opens PR after 30 minutes
3. User sees "PR ready for review" notification with link instantly
4. User reviews, PR is merged by CI
5. User sees green "Merged" badge on task card and task disappears from active list

---

### Story 3: Clarification Q&A In Real-Time
**As a** Web UI user answering clarification questions
**I want** to see the LLM re-analyzing and task dispatch happen instantly
**So that** I get feedback without waiting or refreshing

**Acceptance Criteria:**
- Question list appears without refresh when task needs clarification
- Submit button is disabled during submission, then re-enabled
- Status updates to "dispatched" immediately after submission
- GitHub issue link appears in the detail view
- Loading spinner shows during re-analysis

**Example:**
1. User submits task → LLM asks 2 clarification questions
2. Detail view shows questions inline
3. User types answers and clicks "Submit Clarification"
4. Page shows loading spinner: "Re-analyzing..."
5. Status changes to "dispatched" with GitHub link appearing
6. User sees GitHub issue number and link

---

### Story 4: Timeline Auto-Refresh
**As a** task creator viewing the task detail page
**I want** the event timeline to update in real-time
**So that** I can see the full journey of my task without refreshing

**Acceptance Criteria:**
- Each new event (created, analyzing, dispatched, pr_open, merged) appears in timeline instantly
- Timeline shows event type, timestamp, and relevant payload (issue number, PR number, etc.)
- Newest events appear at the bottom or in reverse chronological order
- Timeline auto-scrolls to latest event

**Example:**
1. User opens task detail page
2. Sees event: "created 10 seconds ago"
3. LLM starts analyzing → "analyzing" event appears
4. 3 seconds later → "llm_response" event with task type
5. 1 second later → "dispatched" event with issue number
6. 30 minutes later → "pr_opened" event with PR number
7. 1 hour later → "merged" event with merge commit SHA

---

### Story 5: Multi-User Awareness
**As a** team member
**I want** to see when other team members create or update tasks
**So that** I'm aware of ongoing work in the pipeline

**Acceptance Criteria:**
- New tasks from other users appear on my dashboard without refresh
- Status updates from other users' tasks appear instantly
- Task creator name is visible (who created this task)
- I can filter to see "all tasks" vs "my tasks"

**Example:**
1. User A opens dashboard
2. User B creates a task "Implement payment webhook validation"
3. User A's dashboard shows the new task appear instantly
4. User A sees badge "created by @username" on task card
5. User A can see the task progresses in real-time

---

## 3. Technical Approach

### 3.1 Transport Protocol: WebSocket

**Selected:** WebSocket (via Socket.io library)

**Rationale:**
- **Low latency:** True bidirectional communication (~100-200ms vs 500ms+ polling)
- **Lower bandwidth:** No repeated HTTP headers, connection reuse
- **Better UX:** Instant notifications, no request latency jitter
- **Scalable:** Connection pooling, horizontal scaling with Redis adapter
- **Reliable:** Socket.io includes auto-reconnect, heartbeat, fallback to polling

**Alternatives Considered:**
1. **HTTP Long Polling:** Simple but higher latency and CPU overhead
2. **Server-Sent Events (SSE):** One-way only, harder to implement client → server updates
3. **gRPC:** Complex, overkill for this use case, not browser-friendly

### 3.2 Library: Socket.io

**Version:** 4.8.0+ (latest stable)

**Why Socket.io over raw WebSocket:**
- Auto-fallback to polling if WebSocket unavailable (network/firewall constraints)
- Built-in heartbeat and reconnection logic
- Room/namespace support for efficient message broadcasting
- Middleware for authentication
- Event namespacing and acknowledgments
- Works well with NestJS via `@nestjs/websockets`

**Connection Details:**
```typescript
// Backend: NestJS WebSocket Gateway
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL },
  transports: ['websocket', 'polling'],
})

// Frontend: Socket.io Client
import io from 'socket.io-client';
const socket = io(process.env.REACT_APP_API_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
});
```

### 3.3 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Web Browsers (React)                      │
│  User A (Task Detail)   │   User B (Dashboard)   │ User C     │
│  socket.emit('join')    │   socket.emit('join')  │            │
└────────┬────────────────┴──────────┬──────────────┴────────────┘
         │                          │
         │    Socket.io Connection (WebSocket)                │
         │                          │
         └────────────┬─────────────┘
                      │
         ┌────────────▼────────────┐
         │  NestJS WebSocket       │
         │  Gateway                │
         │  @WebSocketGateway      │
         └────────────┬────────────┘
                      │
                      │  Emit events to rooms
                      │
         ┌────────────▼────────────┐
         │  Tasks Service          │
         │  (business logic)        │
         │                          │
         │  - Create task          │
         │  - Update status        │
         │  - Emit event           │
         │  - Broadcast via socket │
         └────────────┬────────────┘
                      │
                      │  Read/Write
                      │
         ┌────────────▼────────────┐
         │  MongoDB                │
         │  (tasks collection)      │
         └─────────────────────────┘
```

---

## 4. Events to Stream

### 4.1 Task-Level Events

These events should broadcast to all users connected to a task's room:

| Event | Payload | Frequency | Broadcast To |
|-------|---------|-----------|--------------|
| `task:created` | `{ taskId, title, creator, status: 'received', createdAt }` | Once per task | All connected users |
| `task:analyzing` | `{ taskId, status: 'analyzing' }` | Once per task | All connected users |
| `task:clarification_needed` | `{ taskId, status: 'needs_clarification', questions: [...] }` | Once or more if re-analysis needed | All connected users |
| `task:clarified` | `{ taskId, clarificationAnswers: [...], status: 'dispatched' }` | Once per clarification round | All connected users |
| `task:dispatched` | `{ taskId, status: 'dispatched', issueNumber, issueUrl, githubBranch }` | Once per task | All connected users |
| `task:coding` | `{ taskId, status: 'coding' }` | Once per task | All connected users |
| `task:pr_opened` | `{ taskId, status: 'pr_open', prNumber, prUrl, prTitle }` | Once per task | All connected users |
| `task:pr_merged` | `{ taskId, status: 'merged', mergeCommitSha, mergedAt }` | Once per task (success) | All connected users |
| `task:pr_closed` | `{ taskId, status: 'failed', prNumber }` | Once per task (failure) | All connected users |
| `task:failed` | `{ taskId, status: 'failed', errorMessage }` | Once per task (error) | All connected users |

### 4.2 Event Timeline

Each task status change should also emit a generic event for the timeline:

| Event | Payload | Use Case |
|-------|---------|----------|
| `task:event_added` | `{ taskId, event: { eventType, payload, createdAt } }` | Timeline auto-update |

### 4.3 Dashboard-Level Events

For users viewing the dashboard/task list:

| Event | Payload | Frequency | Broadcast To |
|-------|---------|-----------|--------------|
| `dashboard:task_list_updated` | `{ taskId, status, title, creator, updatedAt }` | Per task status change | All users viewing dashboard |
| `dashboard:task_count_changed` | `{ activeCount, completedCount, failedCount }` | Per status change | All users viewing dashboard |

### 4.4 Implementation: Event Registry

```typescript
// Backend: src/common/enums/websocket-events.enum.ts
export enum WebSocketTaskEvents {
  // Task lifecycle
  TASK_CREATED = 'task:created',
  TASK_ANALYZING = 'task:analyzing',
  TASK_CLARIFICATION_NEEDED = 'task:clarification_needed',
  TASK_CLARIFIED = 'task:clarified',
  TASK_DISPATCHED = 'task:dispatched',
  TASK_CODING = 'task:coding',
  TASK_PR_OPENED = 'task:pr_opened',
  TASK_PR_MERGED = 'task:pr_merged',
  TASK_PR_CLOSED = 'task:pr_closed',
  TASK_FAILED = 'task:failed',
  TASK_EVENT_ADDED = 'task:event_added',

  // Dashboard
  DASHBOARD_TASK_LIST_UPDATED = 'dashboard:task_list_updated',
  DASHBOARD_TASK_COUNT_CHANGED = 'dashboard:task_count_changed',
}
```

---

## 5. Architecture

### 5.1 Backend Architecture

#### 5.1.1 WebSocket Gateway

```typescript
// src/tasks/tasks.gateway.ts
import { WebSocketGateway, WebSocketServer, SubscribeMessage, ConnectedSocket } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { TasksService } from './tasks.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class TasksGateway {
  @WebSocketServer() io: Namespace;

  constructor(private tasksService: TasksService) {}

  // User connects
  handleConnection(client: Socket) {
    // Authenticate here (verify JWT/session)
    // Store userId → socketId mapping
  }

  // User joins a task room
  @SubscribeMessage('task:join')
  async joinTask(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { taskId: string },
  ) {
    // Add user to room: `task:${taskId}`
    client.join(`task:${data.taskId}`);

    // Send current task state
    const task = await this.tasksService.getTask(data.taskId);
    client.emit('task:state', task);
  }

  // User joins dashboard
  @SubscribeMessage('dashboard:join')
  async joinDashboard(@ConnectedSocket() client: Socket) {
    client.join('dashboard');
    const tasks = await this.tasksService.listTasks();
    client.emit('dashboard:state', tasks);
  }

  // Called by TasksService to broadcast events
  emitTaskUpdate(taskId: string, event: string, payload: any) {
    this.io.to(`task:${taskId}`).emit(event, payload);
    this.io.to('dashboard').emit('dashboard:task_list_updated', payload);
  }

  handleDisconnect(client: Socket) {
    // Cleanup: remove from rooms, remove userId mapping
  }
}
```

#### 5.1.2 Tasks Service Integration

Modify existing `TasksService` to emit WebSocket events:

```typescript
// src/tasks/tasks.service.ts
import { Injectable } from '@nestjs/common';
import { TasksGateway } from './tasks.gateway';

@Injectable()
export class TasksService {
  constructor(
    private tasksGateway: TasksGateway,
    // ... other dependencies
  ) {}

  async createTask(createTaskDto: CreateTaskDto): Promise<Task> {
    const task = await this.taskModel.create(createTaskDto);

    // Emit WebSocket event
    this.tasksGateway.emitTaskUpdate(
      task._id.toString(),
      'task:created',
      {
        taskId: task._id,
        title: task.llmSummary,
        creator: task.createdBy,
        status: task.status,
        createdAt: task.createdAt,
      },
    );

    return task;
  }

  async updateTaskStatus(taskId: string, newStatus: TaskStatus, payload: any) {
    const task = await this.taskModel.findByIdAndUpdate(
      taskId,
      { status: newStatus },
      { new: true },
    );

    // Map status to event
    const eventMap = {
      'analyzing': 'task:analyzing',
      'needs_clarification': 'task:clarification_needed',
      'dispatched': 'task:dispatched',
      'coding': 'task:coding',
      'pr_open': 'task:pr_opened',
      'merged': 'task:pr_merged',
      'failed': 'task:pr_closed',
    };

    const event = eventMap[newStatus];
    this.tasksGateway.emitTaskUpdate(taskId, event, {
      taskId,
      status: newStatus,
      ...payload,
    });

    return task;
  }

  // Similar for other status transitions
}
```

#### 5.1.3 Module Registration

```typescript
// src/tasks/tasks.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksGateway } from './tasks.gateway';
import { TaskSchema } from '../common/schemas/task.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: 'Task', schema: TaskSchema }])],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway],
  exports: [TasksService, TasksGateway],
})
export class TasksModule {}
```

### 5.2 Frontend Architecture

#### 5.2.1 Socket.io Client Hook

```typescript
// web/src/hooks/useWebSocket.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import io, { Socket } from 'socket.io-client';

export function useWebSocket() {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // Initialize Socket.io connection
    const socket = io(process.env.REACT_APP_API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
      auth: {
        token: localStorage.getItem('auth_token'),
      },
    });

    socket.on('connect', () => {
      console.log('[WebSocket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[WebSocket] Disconnected:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef.current;
}
```

#### 5.2.2 Task Dashboard Component with Real-Time Updates

```typescript
// web/src/components/TaskDashboard.tsx
import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface Task {
  _id: string;
  title: string;
  status: string;
  creator: string;
  createdAt: string;
  githubIssueUrl?: string;
  githubPrUrl?: string;
}

export function TaskDashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const socket = useWebSocket();

  useEffect(() => {
    // Initial load
    fetch('/api/tasks')
      .then((res) => res.json())
      .then((data) => {
        setTasks(data.tasks || []);
        setLoading(false);
      });

    // Listen for real-time updates
    if (!socket) return;

    // Join dashboard room
    socket.emit('dashboard:join');

    // Listen for task list updates
    socket.on('dashboard:task_list_updated', (payload) => {
      setTasks((prev) => {
        const index = prev.findIndex((t) => t._id === payload.taskId);
        if (index !== -1) {
          // Update existing task
          const updated = [...prev];
          updated[index] = { ...updated[index], status: payload.status, ...payload };
          return updated;
        } else {
          // Add new task
          return [...prev, payload];
        }
      });
    });

    // Listen for dashboard state on reconnect
    socket.on('dashboard:state', (tasks) => {
      setTasks(tasks);
    });

    return () => {
      socket?.off('dashboard:task_list_updated');
      socket?.off('dashboard:state');
    };
  }, [socket]);

  if (loading) return <div>Loading tasks...</div>;

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskCard key={task._id} task={task} socket={socket} />
      ))}
    </div>
  );
}
```

#### 5.2.3 Task Detail Component with Real-Time Timeline

```typescript
// web/src/components/TaskDetail.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';

interface Task {
  _id: string;
  title: string;
  status: string;
  events: Event[];
  githubIssueUrl?: string;
  githubPrUrl?: string;
}

interface Event {
  eventType: string;
  payload: Record<string, any>;
  createdAt: string;
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<Task | null>(null);
  const socket = useWebSocket();

  useEffect(() => {
    // Initial fetch
    if (taskId) {
      fetch(`/api/tasks/${taskId}`)
        .then((res) => res.json())
        .then((data) => setTask(data));
    }

    if (!socket || !taskId) return;

    // Join task-specific room
    socket.emit('task:join', { taskId });

    // Listen for task state (on connect)
    socket.on('task:state', (task) => {
      setTask(task);
    });

    // Listen for status updates
    socket.on('task:analyzing', (payload) => {
      setTask((prev) => {
        if (!prev || prev._id !== taskId) return prev;
        return { ...prev, status: 'analyzing' };
      });
    });

    socket.on('task:dispatched', (payload) => {
      setTask((prev) => {
        if (!prev || prev._id !== taskId) return prev;
        return {
          ...prev,
          status: 'dispatched',
          githubIssueUrl: payload.issueUrl,
        };
      });
    });

    socket.on('task:pr_opened', (payload) => {
      setTask((prev) => {
        if (!prev || prev._id !== taskId) return prev;
        return {
          ...prev,
          status: 'pr_open',
          githubPrUrl: payload.prUrl,
        };
      });
    });

    socket.on('task:pr_merged', (payload) => {
      setTask((prev) => {
        if (!prev || prev._id !== taskId) return prev;
        return {
          ...prev,
          status: 'merged',
        };
      });
    });

    // Listen for timeline updates
    socket.on('task:event_added', (payload) => {
      setTask((prev) => {
        if (!prev || prev._id !== taskId) return prev;
        return {
          ...prev,
          events: [...(prev.events || []), payload.event],
        };
      });
    });

    return () => {
      socket?.off('task:state');
      socket?.off('task:analyzing');
      socket?.off('task:dispatched');
      socket?.off('task:pr_opened');
      socket?.off('task:pr_merged');
      socket?.off('task:event_added');
    };
  }, [socket, taskId]);

  if (!task) return <div>Loading task...</div>;

  return (
    <div className="task-detail">
      <h1>{task.title}</h1>
      <StatusBadge status={task.status} />

      {task.githubIssueUrl && (
        <a href={task.githubIssueUrl} target="_blank">
          View Issue
        </a>
      )}

      {task.githubPrUrl && (
        <a href={task.githubPrUrl} target="_blank">
          View PR
        </a>
      )}

      <Timeline events={task.events} />
    </div>
  );
}

function Timeline({ events }: { events: Event[] }) {
  return (
    <div className="timeline">
      {events.map((event, idx) => (
        <div key={idx} className="timeline-event">
          <div className="event-type">{event.eventType}</div>
          <div className="event-time">{new Date(event.createdAt).toLocaleString()}</div>
          <div className="event-payload">
            {Object.entries(event.payload).map(([key, value]) => (
              <div key={key}>
                {key}: {String(value)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## 6. Data Flow

### 6.1 Sequence Diagram: Task Creation to Dispatch

```
User              Browser             Backend           MongoDB
 │                  │                    │                 │
 │─ Submit Form ───▶│                    │                 │
 │                  │─ POST /api/tasks ─▶│                 │
 │                  │◀─── 202 Accepted ──│                 │
 │                  │                    │─ Create task ──▶│
 │                  │                    │◀─── Success ────│
 │                  │◀─ task:created ────│                 │
 │                  │  (socket event)    │                 │
 │                  │                    │─ Call LLM ────▶ API
 │                  │                    │◀─ Response ────
 │                  │◀─ task:analyzing ──│                 │
 │  (see spinner)   │                    │                 │
 │                  │                    │─ Create Issue ─▶GitHub API
 │                  │                    │◀─ #42 ─────────
 │                  │◀─ task:dispatched ─│─ Update task ──▶│
 │                  │  (socket event)    │◀─── Success ────│
 │                  │ (issue link + #)   │                 │
 │  (see PR link)   │                    │                 │
```

### 6.2 Event Emission Points

These are the places in the code where WebSocket events should be emitted:

| Operation | Event Emitted | Location |
|-----------|---------------|----------|
| Task created via `/api/tasks` | `task:created` | `TasksService.createTask()` |
| LLM analysis started | `task:analyzing` | `TasksService.createTask()` (after LLM call begins) |
| LLM returns, needs clarification | `task:clarification_needed` | `LlmService.analyzeTask()` callback |
| User submits clarification answers | `task:clarified` | `TasksService.clarifyTask()` |
| GitHub issue created | `task:dispatched` | `GithubService.createIssue()` success |
| PR webhook received | `task:pr_opened` | `GithubWebhookController.handlePrOpened()` |
| PR merged webhook received | `task:pr_merged` | `GithubWebhookController.handlePrMerged()` |
| Task fails (LLM, GitHub, etc.) | `task:failed` | `TasksService.updateTaskStatus()` with error |
| Event logged | `task:event_added` | `TasksService.addTaskEvent()` |

---

## 7. Reconnection Strategy

### 7.1 Client-Side Reconnection (Socket.io Built-in)

Socket.io automatically handles reconnection with exponential backoff:

```typescript
const socket = io(apiUrl, {
  reconnection: true,                    // Enable auto-reconnect
  reconnectionDelay: 1000,               // Start with 1s delay
  reconnectionDelayMax: 5000,            // Max 5s delay
  reconnectionAttempts: 5,               // Give up after 5 attempts
  transports: ['websocket', 'polling'],  // Fallback to polling
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us out, try to reconnect with auth
    socket.connect();
  }
  // For other reasons (network issues), auto-reconnect is already happening
});

socket.on('connect', () => {
  console.log('Reconnected! Syncing state...');
  // Ask server for current state
  socket.emit('resync_requested');
});
```

### 7.2 State Resync on Reconnect

When client reconnects, it should resync its state to avoid missing events:

```typescript
// Backend
@SubscribeMessage('resync_requested')
async handleResyncRequest(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { taskIds: string[] },
) {
  // User was in these task rooms, send current state
  for (const taskId of data.taskIds) {
    const task = await this.tasksService.getTask(taskId);
    client.emit('task:state', task);
  }
}

// Frontend
useEffect(() => {
  if (!socket) return;

  const handleReconnect = () => {
    console.log('Syncing state after reconnect...');

    // Ask server to resync state for tasks we're viewing
    const taskIds = [currentTaskId]; // or from localStorage
    socket.emit('resync_requested', { taskIds });
  };

  socket.on('reconnect', handleReconnect);

  return () => {
    socket.off('reconnect', handleReconnect);
  };
}, [socket, currentTaskId]);
```

### 7.3 Offline Handling

For users who go offline or lose connection:

```typescript
function useOfflineDetection() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

// In TaskDetail component
const isOnline = useOfflineDetection();

return (
  <div className="task-detail">
    {!isOnline && (
      <div className="offline-banner">
        You're offline. Reconnecting...
      </div>
    )}
    {/* ... rest of UI */}
  </div>
);
```

---

## 8. Security

### 8.1 WebSocket Authentication

Only authenticated users can connect:

```typescript
// Backend: src/tasks/tasks.gateway.ts
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL },
})
export class TasksGateway implements OnGatewayConnection {
  constructor(private authService: AuthService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from connection auth or headers
      const token = client.handshake.auth.token;

      if (!token) {
        client.disconnect();
        return;
      }

      // Verify JWT/session token
      const user = await this.authService.verifyToken(token);

      if (!user) {
        client.disconnect();
        return;
      }

      // Store user info on socket
      client.data.user = user;
      console.log(`[WebSocket] User ${user.id} connected: ${client.id}`);
    } catch (error) {
      console.error('[WebSocket] Auth error:', error);
      client.disconnect();
    }
  }
}
```

### 8.2 Authorization: Only View Own Tasks + Org Tasks

Users should only receive updates for tasks they can see:

```typescript
// Backend: Filter broadcasts by user permissions
private canViewTask(user: User, task: Task): boolean {
  // Can view if:
  // 1. User created the task, OR
  // 2. User is in the same org, AND task is not private
  return (
    task.createdBy === user.id ||
    (user.orgId === task.orgId && !task.isPrivate)
  );
}

// When emitting task:created event
emitTaskUpdate(taskId: string, event: string, payload: any) {
  const task = this.taskModel.findById(taskId); // or pass task as param

  // Only send to users who can view this task
  const connectedSockets = this.io.sockets.sockets.values();
  for (const socket of connectedSockets) {
    if (this.canViewTask(socket.data.user, task)) {
      socket.emit(event, payload);
    }
  }
}
```

### 8.3 Rate Limiting

Prevent Socket.io clients from spamming events:

```typescript
import rateLimit from 'express-rate-limit';

// Apply to specific socket events
@SubscribeMessage('task:join')
async joinTask(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { taskId: string },
) {
  // Check rate limit per user
  const key = `task:join:${client.data.user.id}`;
  const attempts = this.getRateLimitAttempts(key);

  if (attempts > 10) {
    // Max 10 room joins per second
    client.emit('error', 'Too many requests');
    return;
  }

  this.incrementRateLimitAttempts(key);
  // ... handle join
}
```

### 8.4 Message Validation

Validate Socket.io message payloads:

```typescript
@SubscribeMessage('task:join')
async joinTask(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: unknown,
) {
  // Validate data
  if (typeof data !== 'object' || !data || !('taskId' in data)) {
    client.emit('error', 'Invalid message format');
    return;
  }

  const { taskId } = data as { taskId?: string };

  if (typeof taskId !== 'string' || taskId.length === 0) {
    client.emit('error', 'taskId must be a non-empty string');
    return;
  }

  // ... safe to use taskId
}
```

### 8.5 No Sensitive Data in Events

Never include API keys, secret tokens, or passwords in WebSocket payloads:

```typescript
// WRONG
socket.emit('task:created', {
  taskId,
  apiKey: process.env.OPENAI_API_KEY, // NO!
  githubToken: process.env.GITHUB_TOKEN, // NO!
});

// CORRECT
socket.emit('task:created', {
  taskId,
  title,
  creator,
  status,
  // ... only public data
});
```

---

## 9. Database Changes

### 9.1 Schema Changes Required

**No schema changes needed.** The existing Task schema already has:
- `events` array for event timeline
- `status` field for state tracking
- `createdBy`, `createdAt`, `updatedAt` for metadata

### 9.2 Index Optimization

Ensure optimal indexes for real-time queries:

```typescript
// src/common/schemas/task.schema.ts
@Schema({ timestamps: true })
export class Task {
  // ... existing fields
}

// Ensure these indexes exist
TaskSchema.index({ status: 1 });
TaskSchema.index({ createdBy: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ 'events.eventType': 1 });
```

---

## 10. API Changes

### 10.1 New WebSocket Endpoints

| Event | Direction | Payload | Response |
|-------|-----------|---------|----------|
| `task:join` | Client→Server | `{ taskId: string }` | Server emits `task:state` |
| `dashboard:join` | Client→Server | `{}` | Server emits `dashboard:state` |
| `resync_requested` | Client→Server | `{ taskIds: string[] }` | Server emits `task:state` for each |
| `task:created` | Server→Client | `{ taskId, title, creator, status, createdAt }` | N/A |
| `task:analyzing` | Server→Client | `{ taskId, status }` | N/A |
| `task:clarification_needed` | Server→Client | `{ taskId, questions }` | N/A |
| `task:dispatched` | Server→Client | `{ taskId, issueNumber, issueUrl }` | N/A |
| `task:pr_opened` | Server→Client | `{ taskId, prNumber, prUrl }` | N/A |
| `task:pr_merged` | Server→Client | `{ taskId, mergeCommitSha }` | N/A |
| `task:event_added` | Server→Client | `{ taskId, event }` | N/A |
| `dashboard:task_list_updated` | Server→Client | `{ taskId, status, ... }` | N/A |

### 10.2 REST API Compatibility

Existing REST endpoints remain unchanged. WebSocket events are **supplements** to REST:
- `GET /api/tasks` still works (returns full list)
- `GET /api/tasks/:id` still works (returns full task detail)
- WebSocket is for **incremental updates** in real-time, not replacement

---

## 11. Frontend Changes

### 11.1 New Components

```
web/src/
  hooks/
    useWebSocket.ts            # Socket.io connection hook
    useTaskSubscription.ts     # Subscribe to task updates
    useDashboardSubscription.ts # Subscribe to dashboard updates
    useOfflineDetection.ts     # Detect online/offline status
  context/
    WebSocketContext.tsx       # Provide socket to entire app
  components/
    ConnectionStatus.tsx       # Show if connected/reconnecting
    OfflineBanner.tsx         # Show if offline
```

### 11.2 Modified Components

| Component | Changes |
|-----------|---------|
| `TaskDashboard.tsx` | Add real-time task list updates, status badge animations |
| `TaskDetail.tsx` | Add real-time timeline, auto-scroll, loading states |
| `TaskForm.tsx` | Add real-time clarification Q&A, loading spinner during LLM |
| `StatusBadge.tsx` | Add animations on status change (fade/pulse) |
| `App.tsx` | Wrap with `<WebSocketProvider>`, show connection status |

### 11.3 UI Enhancements

**Loading States:**
```typescript
<div className="task-card">
  <h3>{task.title}</h3>
  <StatusBadge
    status={task.status}
    isLoading={task.status === 'analyzing'}
  />
</div>

// StatusBadge component
function StatusBadge({ status, isLoading }) {
  return (
    <span className={`badge badge-${status} ${isLoading ? 'spinning' : ''}`}>
      {status}
    </span>
  );
}
```

**Timeline Auto-Scroll:**
```typescript
function Timeline({ events }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to latest event
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events]);

  return (
    <div ref={listRef} className="timeline">
      {/* ... events */}
    </div>
  );
}
```

**Animations on Status Change:**
```css
/* web/src/styles/animations.css */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.badge-spinning {
  animation: pulse 1.5s ease-in-out infinite;
}

.event-new {
  animation: fadeIn 0.3s ease-out;
}
```

---

## 12. Implementation Tasks

### Phase 1: Backend WebSocket Gateway (Estimated: 8-10 hours)

1. **Create WebSocket Gateway** (2h)
   - [ ] Generate `src/tasks/tasks.gateway.ts` with NestJS CLI
   - [ ] Implement `TasksGateway` class with Socket.io
   - [ ] Add `handleConnection()` and `handleDisconnect()`
   - [ ] Implement `@SubscribeMessage('task:join')` and `@SubscribeMessage('dashboard:join')`
   - [ ] Test with Socket.io client (manual test file)

2. **Add Event Emission to TasksService** (3h)
   - [ ] Create `WebSocketTaskEvents` enum in `src/common/enums/`
   - [ ] Inject `TasksGateway` into `TasksService`
   - [ ] Add event emission on:
     - `createTask()` → `task:created`
     - `updateTaskStatus()` → appropriate event
     - `addTaskEvent()` → `task:event_added`
   - [ ] Update `GithubWebhookController` to call `TasksService.updateTaskStatus()` (triggers WebSocket)
   - [ ] Unit tests for event emission

3. **Add Authentication Middleware** (2h)
   - [ ] Implement JWT verification in `handleConnection()`
   - [ ] Store user info on `socket.data`
   - [ ] Add authorization checks (user can view task)
   - [ ] Unit tests

4. **Register Gateway in Module** (1h)
   - [ ] Add `TasksGateway` to `TasksModule.providers`
   - [ ] Test that gateway starts with application

5. **Integration Tests** (2h)
   - [ ] Create `src/tasks/tasks.gateway.spec.ts`
   - [ ] Test connection, room join, event emission
   - [ ] Mock Socket.io and TasksService

### Phase 2: Frontend Socket.io Setup (Estimated: 6-8 hours)

6. **Create WebSocket Context** (2h)
   - [ ] Create `web/src/context/WebSocketContext.tsx`
   - [ ] Provider with Socket.io initialization
   - [ ] Handle connection/disconnection
   - [ ] Expose socket via hook `useWebSocket()`

7. **Create Hooks** (2h)
   - [ ] `web/src/hooks/useWebSocket.ts` — connection management
   - [ ] `web/src/hooks/useTaskSubscription.ts` — subscribe to task room
   - [ ] `web/src/hooks/useDashboardSubscription.ts` — subscribe to dashboard
   - [ ] `web/src/hooks/useOfflineDetection.ts` — browser online status
   - [ ] Unit tests for hooks

8. **Create UI Components** (2h)
   - [ ] `web/src/components/ConnectionStatus.tsx` — show connected/disconnecting
   - [ ] `web/src/components/OfflineBanner.tsx` — show offline warning
   - [ ] `web/src/styles/animations.css` — add pulse, fade-in animations

9. **Integrate with App** (1h)
   - [ ] Wrap `<App>` with `<WebSocketProvider>`
   - [ ] Add `<ConnectionStatus>` to top of page

### Phase 3: Real-Time Dashboard (Estimated: 6-8 hours)

10. **Update TaskDashboard Component** (3h)
    - [ ] Connect to dashboard room on mount
    - [ ] Listen to `dashboard:task_list_updated` events
    - [ ] Update task list state in real-time
    - [ ] Add loading spinner animations
    - [ ] Maintain sort order and pagination while updating

11. **Update TaskCard Component** (2h)
    - [ ] Show status badge with animation
    - [ ] Add creator name
    - [ ] Add "created X minutes ago" timestamp
    - [ ] Highlight newly added tasks

12. **Add Filters** (2h)
    - [ ] "My Tasks" vs "All Tasks" toggle
    - [ ] Filter by status
    - [ ] Filter by creator
    - [ ] Real-time filter application

13. **Integration Tests** (1h)
    - [ ] Test dashboard real-time updates
    - [ ] Test with mock Socket.io server

### Phase 4: Real-Time Task Detail (Estimated: 6-8 hours)

14. **Update TaskDetail Component** (3h)
    - [ ] Connect to task room on mount
    - [ ] Listen to all task-specific events
    - [ ] Update status badge with animation
    - [ ] Update GitHub issue/PR links when available
    - [ ] Handle disconnection gracefully

15. **Timeline Auto-Update** (2h)
    - [ ] Listen to `task:event_added` events
    - [ ] Append events to timeline in real-time
    - [ ] Auto-scroll to latest event
    - [ ] Show timestamps relative to now ("2 seconds ago")

16. **Clarification Q&A** (2h)
    - [ ] Listen to `task:clarification_needed` event
    - [ ] Display questions inline
    - [ ] Show loading spinner during submit
    - [ ] Listen to `task:clarified` and show success

17. **Integration Tests** (1h)
    - [ ] Test task detail real-time updates
    - [ ] Test timeline auto-scroll
    - [ ] Mock Socket.io server responses

### Phase 5: Reconnection & State Sync (Estimated: 4-6 hours)

18. **Implement Resync Logic** (2h)
    - [ ] Backend: implement `@SubscribeMessage('resync_requested')`
    - [ ] Frontend: emit `resync_requested` on reconnect
    - [ ] Test with manual disconnect/reconnect

19. **Offline Handling** (2h)
    - [ ] Show offline banner when detected
    - [ ] Buffer events (or fetch on reconnect)
    - [ ] Queue user actions (e.g., form submission) for retry
    - [ ] Test with browser dev tools offline mode

20. **Error Handling** (1h)
    - [ ] Handle WebSocket connection errors
    - [ ] Fall back to polling if WebSocket unavailable
    - [ ] Log errors for debugging
    - [ ] User-friendly error messages

### Phase 6: Testing & Optimization (Estimated: 8-10 hours)

21. **Unit Tests** (3h)
    - [ ] TasksGateway unit tests
    - [ ] Hook unit tests
    - [ ] Component unit tests (with mock socket)

22. **E2E Tests** (3h)
    - [ ] Full flow: create task → see real-time updates
    - [ ] Multi-user scenario (two browsers)
    - [ ] Offline → reconnect scenario
    - [ ] Network latency simulation

23. **Performance Optimization** (2h)
    - [ ] Measure WebSocket message frequency
    - [ ] Optimize event payloads (don't send full task doc)
    - [ ] Debounce rapid updates if needed
    - [ ] Monitor memory usage (cleanup on disconnect)

24. **Documentation** (2h)
    - [ ] WebSocket API docs in `docs/websocket.md`
    - [ ] Frontend integration guide
    - [ ] Troubleshooting guide
    - [ ] Update SPEC.md with real-time section

### Total Estimated Time: 48-60 hours (6-7.5 days with parallel work)

---

## 13. Estimated Complexity

### By Component

| Component | Complexity | Effort | Risk | Dependencies |
|-----------|------------|--------|------|--------------|
| **WebSocket Gateway** | Medium | 8-10h | Low | Socket.io, NestJS websockets |
| **Event Emission** | Medium | 6h | Low | TasksService, GithubWebhookController |
| **Auth Middleware** | Low | 2h | Low | AuthService (exists) |
| **Frontend Context** | Medium | 4h | Low | React, Socket.io client |
| **Hooks** | Medium | 4h | Low | React hooks, TypeScript |
| **Dashboard Component** | Medium | 5h | Medium | Real-time state management |
| **Task Detail Component** | Medium | 5h | Medium | Real-time state, timeline scroll |
| **Clarification Q&A** | Low | 2h | Low | Existing form logic |
| **Reconnection** | High | 4h | Medium | Socket.io reconnect API, state sync |
| **Offline Detection** | Low | 2h | Low | Browser API |
| **Testing** | High | 8h | High | Mock socket, E2E setup |
| **Documentation** | Low | 2h | Low | - |

### Overall Assessment

**Total Complexity: MEDIUM**
- WebSocket integration is straightforward with Socket.io and NestJS support
- Frontend state management is the most complex part (real-time list updates, timeline)
- Reconnection/offline handling adds complexity but Socket.io handles most of it
- Testing requires mock Socket.io setup (learning curve)
- No database schema changes needed (big win)
- Can be built in parallel: backend + frontend teams working independently

---

## 14. Rollout Strategy

### 14.1 Feature Flags

Use feature flags to roll out gradually:

```typescript
// src/common/config/feature-flags.ts
export const FEATURE_FLAGS = {
  WEBSOCKET_ENABLED: process.env.FEATURE_WEBSOCKET_ENABLED === 'true',
  WEBSOCKET_DASHBOARD: process.env.FEATURE_WEBSOCKET_DASHBOARD === 'true',
  WEBSOCKET_TASK_DETAIL: process.env.FEATURE_WEBSOCKET_TASK_DETAIL === 'true',
};
```

```typescript
// Frontend: useWebSocket hook
export function useWebSocket() {
  const isEnabled = process.env.REACT_APP_FEATURE_WEBSOCKET_ENABLED === 'true';

  useEffect(() => {
    if (!isEnabled) {
      console.log('[WebSocket] Feature disabled, skipping connection');
      return;
    }

    // ... connect
  }, [isEnabled]);
}
```

### 14.2 Rollout Phases

1. **Phase 1: Backend Only** (Enable tasks.gateway, but frontend doesn't connect)
2. **Phase 2: Opt-In Frontend** (Flag to enable, early adopters test)
3. **Phase 3: Gradual Rollout** (Enable for 10% → 50% → 100% of users)
4. **Phase 4: Full GA** (Remove feature flags, make default)

### 14.3 Monitoring

```typescript
// src/common/monitoring/websocket.metrics.ts
export class WebSocketMetrics {
  private connectedUsers = 0;
  private messagesPerSecond = 0;
  private errors = 0;

  recordConnect() { this.connectedUsers++; }
  recordDisconnect() { this.connectedUsers--; }
  recordMessage() { this.messagesPerSecond++; }
  recordError() { this.errors++; }

  getMetrics() {
    return {
      connectedUsers: this.connectedUsers,
      messagesPerSecond: this.messagesPerSecond,
      totalErrors: this.errors,
    };
  }
}
```

Add to `/api/health`:
```json
{
  "status": "ok",
  "websocket": {
    "connectedUsers": 42,
    "messagesPerSecond": 15,
    "totalErrors": 2
  }
}
```

---

## 15. Known Limitations & Future Enhancements

### 15.1 Current Limitations

1. **No Message Persistence**: If server restarts, queued messages are lost. For MVP, this is acceptable.
2. **Single-Server Only**: Redis adapter needed for horizontal scaling (Phase 2)
3. **No Selective Broadcasting**: All authenticated users in a room get all events (not user-specific filtering within room)
4. **No Acknowledgments**: Client-side, we don't know if server received the event (Socket.io has this, we just don't implement)

### 15.2 Future Enhancements (v2+)

- **Redis Adapter**: For horizontal scaling (multiple app instances)
- **Message Queueing**: Bull + Redis for message persistence and retry
- **User-Specific Notifications**: DM user about task updates (vs broadcasting)
- **Real-Time Collaboration**: Multiple users editing task details simultaneously
- **Presence Indicators**: "User X is viewing this task"
- **Real-Time Comments**: GitHub PR comments streaming to task detail view
- **Metrics Dashboard**: Admin view of WebSocket connections, message rates, errors
- **Mobile Support**: Native app WebSocket client

---

## 16. Deployment Considerations

### 16.1 Environment Variables

Add to `.env.example`:

```bash
# WebSocket
WEBSOCKET_CORS_ORIGIN=http://localhost:5173,https://ai-pipeline.up.railway.app
FEATURE_WEBSOCKET_ENABLED=true
FEATURE_WEBSOCKET_DASHBOARD=true
FEATURE_WEBSOCKET_TASK_DETAIL=true

# Frontend
REACT_APP_API_URL=http://localhost:3000
REACT_APP_FEATURE_WEBSOCKET_ENABLED=true
```

### 16.2 Railway Deployment

Update `Dockerfile` to ensure Socket.io can bind to port:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm run build
EXPOSE 3000
CMD ["node", "dist/main"]
```

Update `railway.toml`:

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"

[service]
internalPort = 3000
# Socket.io uses same port as REST API
```

### 16.3 Load Balancing

If using Railway with multiple instances, Redis adapter is needed:

```typescript
// Phase 2: Add Redis adapter
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

@WebSocketGateway({
  cors: { origin: process.env.WEBSOCKET_CORS_ORIGIN },
  transports: ['websocket', 'polling'],
  adapter: createAdapter(pubClient, subClient), // Redis adapter
})
export class TasksGateway { }
```

---

## 17. Security Checklist

- [ ] WebSocket requires authentication (verify token in `handleConnection`)
- [ ] Users can only see tasks they have permission to view
- [ ] No API keys, secrets, or passwords in WebSocket events
- [ ] Rate limiting on Socket.io message emission
- [ ] CORS origin restricted to `FRONTEND_URL`
- [ ] No SQL/NoSQL injection (Mongoose validates)
- [ ] Cross-site WebSocket hijacking (CSWSH) prevention (CORS handles)
- [ ] No sensitive data in browser dev tools console (avoid logging full payloads)
- [ ] Socket.io transports allowlist (websocket + polling only)

---

## 18. Example Usage Flow

### End-to-End Scenario: Create Task → Real-Time Updates

**Time: 0s** — User opens dashboard
```
Browser connects: emit 'dashboard:join'
Server sends: { taskId, title, status, ... } × N tasks
Dashboard shows: task list, all statuses
```

**Time: 5s** — User submits new task "Fix payment bug"
```
Browser: POST /api/tasks
Server: Creates task, emits 'task:created' to all in 'dashboard' room
Browser: Receives 'task:created' event, adds task to list
Dashboard: New task appears instantly in "analyzing" state with spinner
```

**Time: 8s** — LLM analysis completes
```
Server: Emits 'task:analyzing' to task-specific room
Browser: Updates status badge to spinning
Dashboard: Status badge shows "analyzing" with animation
```

**Time: 12s** — GitHub issue created
```
Server: Emits 'task:dispatched' with issueNumber and issueUrl
Browser: Updates task card
Dashboard: Shows green "dispatched" badge, GitHub issue link appears
Task Detail: If user viewing detail page, shows issue URL and #42
```

**Time: 35min** — Agent opens PR
```
GitHub webhook: Received by /api/webhooks/github
Server: Updates task status to 'pr_open', emits 'task:pr_opened'
Browser: Receives event
Dashboard: Task status changes to "pr_open", PR link appears
Task Detail: Shows PR link, timeline shows new "pr_opened" event
```

**Time: 40min** — PR merged
```
GitHub webhook: Received by /api/webhooks/github
Server: Updates task status to 'merged', emits 'task:pr_merged'
Browser: Receives event
Dashboard: Task status changes to "merged" (blue badge), moves to completed section
Task Detail: Shows "merged" status, timeline shows "merged" event with commit SHA
```

---

## 19. Testing Strategy

### 19.1 Unit Tests

```typescript
// Example: TasksGateway.spec.ts
describe('TasksGateway', () => {
  let gateway: TasksGateway;
  let tasksService: TasksService;
  let mockSocket: jest.Mocked<Socket>;

  beforeEach(() => {
    // Mock Socket.io and TasksService
    mockSocket = createMockSocket();
    tasksService = createMockTasksService();
    gateway = new TasksGateway(tasksService);
  });

  it('should authenticate connection with valid token', async () => {
    mockSocket.handshake.auth.token = 'valid-jwt';
    await gateway.handleConnection(mockSocket);
    expect(mockSocket.data.user).toBeDefined();
  });

  it('should disconnect user with invalid token', async () => {
    mockSocket.handshake.auth.token = 'invalid-jwt';
    await gateway.handleConnection(mockSocket);
    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should emit task:created when task is created', async () => {
    const task = { _id: 'task-1', title: 'Test' };
    gateway.emitTaskUpdate('task-1', 'task:created', task);
    expect(gateway.io.to).toHaveBeenCalledWith('task:task-1');
  });
});
```

### 19.2 Integration Tests

```typescript
// Example: TaskDashboard.integration.spec.ts
describe('TaskDashboard Real-Time Updates', () => {
  let server: any;
  let client1: Socket;
  let client2: Socket;

  beforeAll(async () => {
    server = await startTestServer();
  });

  it('should broadcast task creation to all connected users', (done) => {
    client1 = io(server.url);
    client2 = io(server.url);

    client1.on('dashboard:state', () => {
      client1.emit('task:create', { description: 'Test' });
    });

    client2.on('dashboard:task_list_updated', (payload) => {
      expect(payload.title).toBe('Test');
      done();
    });
  });

  afterAll(() => {
    client1.disconnect();
    client2.disconnect();
    server.close();
  });
});
```

---

## Appendix A: Socket.io Events Quick Reference

### Client → Server

```
task:join            { taskId: string }
dashboard:join       {}
resync_requested     { taskIds: string[] }
```

### Server → Client

```
task:state                    { taskId, title, status, events[], ... }
task:created                  { taskId, title, creator, status, createdAt }
task:analyzing                { taskId, status }
task:clarification_needed     { taskId, questions: string[] }
task:clarified                { taskId, status, issueUrl, issueNumber }
task:dispatched               { taskId, status, issueUrl, issueNumber, githubBranch }
task:coding                   { taskId, status }
task:pr_opened                { taskId, status, prUrl, prNumber, prTitle }
task:pr_merged                { taskId, status, mergeCommitSha }
task:pr_closed                { taskId, status, prNumber }
task:failed                   { taskId, status, errorMessage }
task:event_added              { taskId, event: { eventType, payload, createdAt } }
dashboard:state               { tasks: Task[] }
dashboard:task_list_updated   { taskId, status, title, ... }
dashboard:task_count_changed  { activeCount, completedCount, failedCount }
error                         { message: string }
```

---

## Appendix B: Browser Compatibility

| Browser | WebSocket | Fallback (Polling) |
|---------|-----------|-------------------|
| Chrome 16+ | Yes | Yes |
| Firefox 11+ | Yes | Yes |
| Safari 5.1+ | Yes | Yes |
| Edge 12+ | Yes | Yes |
| IE 10+ | No | Yes (polling only) |
| Mobile Safari (iOS 5+) | Yes | Yes |
| Android Browser 4.4+ | Yes | Yes |

Socket.io automatically falls back to polling for browsers without WebSocket support.

---

## Appendix C: Performance Benchmarks (Targets)

| Metric | Target | Method |
|--------|--------|--------|
| Connection time | < 500ms | Measure from `io()` to `connect` event |
| Message latency | < 200ms | Server → Client for typical event |
| Event frequency | 10 msgs/sec | Under normal task workflow |
| Memory per client | < 1MB | Measure on server per connected socket |
| CPU impact | < 5% | Per 100 concurrent connections |

---

**End of Specification**

---

**Document History**

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-02-15 | Claude Code | Initial specification |

