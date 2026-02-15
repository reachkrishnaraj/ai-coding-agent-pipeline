/**
 * WebSocket Event Types
 * Used for real-time task updates via Socket.io
 */
export enum WebSocketEvents {
  // Client -> Server events
  JOIN_TASK = 'task:join',
  LEAVE_TASK = 'task:leave',
  JOIN_DASHBOARD = 'dashboard:join',
  LEAVE_DASHBOARD = 'dashboard:leave',
  RESYNC_REQUESTED = 'resync_requested',

  // Server -> Client: Task lifecycle events
  TASK_STATE = 'task:state',
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
  TASK_STATUS_CHANGED = 'task:status_changed',
  TASK_EVENT_ADDED = 'task:event_added',
  TASK_PR_UPDATED = 'task:pr_updated',

  // Server -> Client: Dashboard events
  DASHBOARD_STATE = 'dashboard:state',
  DASHBOARD_TASK_LIST_UPDATED = 'dashboard:task_list_updated',
  DASHBOARD_TASK_COUNT_CHANGED = 'dashboard:task_count_changed',

  // Connection events
  CONNECTION = 'connection',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
}
