# REAL-TIME UPDATES — Quick Summary

**Full Spec:** [REAL-TIME-UPDATES.md](./REAL-TIME-UPDATES.md)

---

## The Ask

Currently users must refresh the dashboard manually to see task status changes. Implement WebSocket-based real-time updates so changes appear instantly (< 500ms).

## Tech Stack

- **Backend:** NestJS WebSocket Gateway + Socket.io
- **Frontend:** React hooks + Socket.io client
- **Transport:** WebSocket (with polling fallback)
- **No DB schema changes needed** (use existing `events` array)

## Key Events to Stream

```
Task Lifecycle:
  task:created             → Task appears on dashboard
  task:analyzing           → LLM working, spinner shows
  task:clarification_needed → Questions appear for user
  task:dispatched          → GitHub issue link appears
  task:pr_opened           → PR link appears with "review ready" message
  task:pr_merged           → Status → "merged", task moves to completed
  task:failed              → Status → "failed" with error message

Dashboard:
  dashboard:task_list_updated → Any user's task status change

Timeline:
  task:event_added         → New event in task detail timeline
```

## Architecture (Simple Version)

```
┌─ Browser 1 (Dashboard)
│  └─ socket.on('task:created')
│     └─ update task list
│
├─ Browser 2 (Task Detail)
│  └─ socket.on('task:pr_opened')
│     └─ show PR link
│
└─ Backend (NestJS)
   └─ TasksGateway
      └─ emit events via socket.io
         └─ MongoDB (no schema changes)
```

## Implementation Phases

### Phase 1: Backend WebSocket (8-10h)
- [ ] Create `src/tasks/tasks.gateway.ts`
- [ ] Add event emission to `TasksService`
- [ ] Implement authentication middleware
- [ ] Unit tests

### Phase 2: Frontend Setup (6-8h)
- [ ] Create Socket.io context + hooks
- [ ] Add connection status UI
- [ ] Offline detection

### Phase 3: Dashboard Real-Time (6-8h)
- [ ] Update `TaskDashboard.tsx` to listen to events
- [ ] Real-time task list updates
- [ ] Status badge animations

### Phase 4: Task Detail Real-Time (6-8h)
- [ ] Update `TaskDetail.tsx` to listen to task events
- [ ] Timeline auto-updates with new events
- [ ] Auto-scroll to latest event

### Phase 5: Reconnection & Sync (4-6h)
- [ ] Implement state resync on reconnect
- [ ] Offline handling
- [ ] Error recovery

### Phase 6: Testing & Docs (8-10h)
- [ ] Unit tests (gateway, hooks, components)
- [ ] E2E tests (full flow)
- [ ] Performance testing
- [ ] Documentation

**Total: 48-60 hours (6-7.5 days with parallel work)**

## Complexity Assessment

| Part | Complexity | Time | Risk |
|------|-----------|------|------|
| WebSocket Gateway | Medium | 10h | Low |
| Event Emission | Medium | 6h | Low |
| Frontend Hooks | Medium | 4h | Low |
| Dashboard Component | Medium | 5h | Medium |
| Task Detail Component | Medium | 5h | Medium |
| Reconnection/Offline | High | 4h | Medium |
| Testing | High | 8h | High |

**Overall: MEDIUM Complexity**

Why? Socket.io handles most hard stuff (reconnect, fallback). No DB changes needed. The tricky part is React real-time state management + testing.

## Security Checklist

- [ ] Auth: WebSocket requires JWT verification
- [ ] Auth: Users only see tasks they can view
- [ ] Auth: No API keys/secrets in events
- [ ] Rate limiting on Socket.io message emission
- [ ] CORS: frontend URL allowlist
- [ ] XSS: No sensitive data in console logs

## New Endpoints (WebSocket)

| Client → Server | Payload | Response |
|---|---|---|
| `task:join` | `{ taskId }` | Server sends `task:state` |
| `dashboard:join` | `{}` | Server sends `dashboard:state` |
| `resync_requested` | `{ taskIds }` | Server sends current state |

| Server → Client | Payload | When |
|---|---|---|
| `task:created` | `{ taskId, title, creator, status, createdAt }` | Task created |
| `task:analyzing` | `{ taskId, status }` | LLM starts |
| `task:dispatched` | `{ taskId, issueUrl, issueNumber }` | Issue created |
| `task:pr_opened` | `{ taskId, prUrl, prNumber }` | PR opened |
| `task:pr_merged` | `{ taskId, mergeCommitSha }` | PR merged |
| `task:event_added` | `{ taskId, event }` | Timeline update |
| `dashboard:task_list_updated` | `{ taskId, status, ... }` | Any status change |

## Rollout Strategy

1. **Phase 1:** Backend only (no frontend connection)
2. **Phase 2:** Opt-in via feature flag (early adopters)
3. **Phase 3:** Gradual rollout (10% → 50% → 100%)
4. **Phase 4:** Full GA (feature flag removed)

Use env var: `FEATURE_WEBSOCKET_ENABLED=true` to control rollout.

## Example User Flow

```
0s:   User opens dashboard
      → Browser: socket.emit('dashboard:join')
      → Server: sends task list
      → Dashboard: shows all tasks

5s:   User submits "Fix payment bug"
      → Browser: POST /api/tasks
      → Server: task:created event
      → Dashboard: new task appears instantly (analyzing state)

12s:  LLM finishes, issue created
      → Server: task:dispatched event
      → Dashboard: GitHub link appears, badge → "dispatched"

35min: Agent opens PR
      → GitHub webhook → Server
      → Server: task:pr_opened event
      → Dashboard: PR link appears
      → Task Detail (if open): PR link + timeline event

40min: PR merged
      → GitHub webhook → Server
      → Server: task:pr_merged event
      → Dashboard: badge → "merged", task moves to completed
      → Task Detail: shows "merged" status + merge commit SHA
```

## Browser Support

All modern browsers: Chrome, Firefox, Safari, Edge.
IE 10+ falls back to polling (Socket.io handles automatically).

## Known Limitations (v1)

- Single server only (no Redis adapter for scaling yet)
- No message persistence if server restarts
- All users in room get all events (no user-specific filtering within room)

These are Phase 2 enhancements.

## Files to Create/Modify

### Backend
```
src/
  tasks/
    tasks.gateway.ts          ← NEW: WebSocket gateway
    tasks.gateway.spec.ts     ← NEW: Tests
  common/
    enums/
      websocket-events.enum.ts ← NEW: Event constants
```

Modify:
- `tasks.service.ts` — add gateway injection + event emission
- `tasks.module.ts` — add TasksGateway to providers

### Frontend
```
web/src/
  hooks/
    useWebSocket.ts           ← NEW
    useTaskSubscription.ts    ← NEW
    useDashboardSubscription.ts ← NEW
    useOfflineDetection.ts    ← NEW
  context/
    WebSocketContext.tsx      ← NEW
  components/
    ConnectionStatus.tsx      ← NEW
    OfflineBanner.tsx        ← NEW
  styles/
    animations.css           ← NEW
```

Modify:
- `TaskDashboard.tsx` — add real-time updates
- `TaskDetail.tsx` — add real-time updates
- `App.tsx` — wrap with WebSocketProvider

## Testing Priority

1. **High:** WebSocket gateway auth, event emission
2. **High:** Dashboard real-time updates
3. **High:** Reconnection logic
4. **Medium:** Task detail updates
5. **Medium:** Offline handling
6. **Low:** UI animations

## Success Criteria

- Status changes appear in < 500ms
- Users never need to refresh to see updates
- Reconnection happens automatically without data loss
- Works offline (queues/retries on reconnect)
- Supports 100+ concurrent users per instance
- No memory leaks or connection leaks

## Next Steps

1. Review this spec
2. Break into GitHub issues (one per phase)
3. Create feature branches: `feat/websocket-gateway`, `feat/websocket-frontend`, etc.
4. Start Phase 1 (backend gateway)
5. While Phase 1 in review, start Phase 2 (frontend setup in parallel)

---

**For full details, see [REAL-TIME-UPDATES.md](./REAL-TIME-UPDATES.md)**
