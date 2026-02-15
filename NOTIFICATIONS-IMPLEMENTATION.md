# EMAIL/SLACK NOTIFICATIONS IMPLEMENTATION

## Implementation Summary

This document describes the Email/Slack Notifications feature implemented for the AI Pipeline system.

## Branch

`feat/notifications`

## Files Created

### Backend

#### Schemas
- `src/common/schemas/notification-preference.schema.ts` - User notification preferences
- `src/common/schemas/notification-log.schema.ts` - Notification audit log

#### Services
- `src/notifications/notifications.service.ts` - Main notification service
- `src/notifications/email.service.ts` - Email sending via Nodemailer
- `src/notifications/notifications.controller.ts` - API endpoints
- `src/notifications/notifications.module.ts` - Module definition

### Frontend
- `web/src/pages/NotificationSettings.tsx` - User preferences UI

### Configuration
- `.env.example` - Updated with SMTP and notification config
- `src/app.module.ts` - Added NotificationsModule
- `web/src/App.tsx` - Added notification settings route
- `web/src/components/Navbar.tsx` - Added notifications link

## Features Implemented

### 1. Notification Preferences Schema
- Per-user notification settings stored in MongoDB
- Supports multiple channels (email, Slack DM, Slack channel)
- Event-level preferences (task_created, dispatched, pr_opened, pr_merged, etc.)
- Quiet hours with timezone support
- Digest modes (real-time, hourly, daily)
- Unsubscribe token for email compliance

### 2. Notification Logging
- Complete audit trail of all notifications
- Tracks delivery status (sent, delivered, bounced, failed)
- Email open/click tracking support
- Error logging for failed notifications

### 3. Email Service (Nodemailer)
- SMTP integration configurable via environment variables
- HTML email templates for all event types
- Plain-text fallback
- Unsubscribe headers (CAN-SPAM/GDPR compliant)

### 4. Notifications Service
- Send notifications based on event type
- Check user preferences before sending
- Respect quiet hours (with urgent event bypass)
- Multi-channel delivery (email + Slack)
- Unsubscribe/resubscribe functionality

### 5. API Endpoints
- `GET /api/notifications/preferences` - Get user preferences
- `PATCH /api/notifications/preferences` - Update preferences
- `POST /api/notifications/preferences/reset` - Reset to defaults
- `GET /api/notifications/history` - Get notification log
- `GET /api/notifications/preferences/unsubscribe/:token` - Unsubscribe
- `GET /api/notifications/preferences/resubscribe/:token` - Resubscribe
- `GET /api/notifications/quiet-hours/status` - Check quiet hours status

### 6. Frontend - Notification Settings Page
- Toggle notification channels (email, Slack DM, Slack channel)
- Configure digest mode (real-time, hourly, daily)
- Set quiet hours with time range and days of week
- Per-event notification preferences
- Visual indicators for urgent/required events
- Save/reset functionality
- Success/error messages

## Notification Events Supported

| Event | Description | Default | Urgent |
|-------|-------------|---------|--------|
| task_created | New task submitted | Disabled | No |
| task_clarification_needed | Clarification required | Enabled | Yes (blocking) |
| task_dispatched | Task assigned to agent | Enabled | No |
| pr_opened | PR ready for review | Enabled | No |
| pr_merged | PR merged | Enabled | No |
| pr_closed | PR closed without merging | Enabled | Yes |
| task_failed | Task error | Enabled | Yes |
| agent_question | Agent needs clarification | Enabled | Yes (blocking) |
| task_clarified | Clarification provided | Disabled | No |

## Email Templates

Each event type has a custom email template with:
- Event-specific subject line
- HTML body with task details
- Links to task page and relevant resources
- Unsubscribe footer with compliance headers
- CAN-SPAM List-Unsubscribe headers

## Slack Integration

- Sends DM notifications using existing SlackService
- Formats messages with Markdown
- Includes links to tasks and PRs
- Respects user Slack preferences

## Quiet Hours

- Time-based notification suppression
- Configurable start/end times
- Day-of-week selection
- Urgent events can bypass quiet hours
- Timezone support

## Environment Variables

Required SMTP configuration:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM_ADDRESS=noreply@ai-pipeline.app
EMAIL_FROM_NAME=AI Pipeline
EMAIL_SUPPORT_ADDRESS=support@ai-pipeline.app
```

Optional configuration:
```bash
NOTIFICATION_RETENTION_DAYS=90
NOTIFICATION_MAX_BATCH_SIZE=50
NOTIFICATION_BATCH_TIMEOUT_MS=300000
```

## Integration Points

To integrate notifications into the task lifecycle:

```typescript
// In your task service
constructor(
  private notificationsService: NotificationsService,
) {}

// When task is dispatched
await this.notificationsService.sendNotification(
  task.createdBy,
  'task_dispatched',
  {
    taskId: task.id,
    summary: task.llmSummary,
    repo: task.repo,
    agent: task.recommendedAgent,
    issueUrl: task.githubIssueUrl,
  }
);

// When PR is opened
await this.notificationsService.sendNotification(
  task.createdBy,
  'pr_opened',
  {
    taskId: task.id,
    summary: task.llmSummary,
    repo: task.repo,
    prNumber: task.githubPrNumber,
    prUrl: task.githubPrUrl,
  }
);
```

## Future Enhancements

Not implemented in V1 but planned:
- Digest batching (hourly/daily summary emails)
- Slack channel posting
- SMS notifications
- Push notifications
- Notification webhooks
- Email delivery tracking (open/click rates)
- Advanced filtering rules

## Testing

To test the implementation:

1. Start the backend with SMTP configured
2. Navigate to `/settings/notifications`
3. Configure preferences
4. Trigger task events (create task, dispatch, etc.)
5. Verify notifications are sent via email/Slack
6. Check `/api/notifications/history` for delivery logs
7. Test unsubscribe/resubscribe flow

## Dependencies Added

- `nodemailer@8.0.1` - SMTP email sending
- `@types/nodemailer@7.0.10` - TypeScript types

## Notes

- Email service gracefully degrades if SMTP not configured
- Slack service uses existing integration from SlackModule
- All notification delivery is non-blocking (errors logged but don't fail requests)
- Default preferences created automatically for new users
- Unsubscribe tokens are cryptographically secure (SHA-256)
- Quiet hours respect user timezone setting

## Completion Status

✅ Backend schemas created
✅ Notification service implemented
✅ Email service with Nodemailer
✅ API endpoints for preferences
✅ Frontend settings page
✅ Navigation updated
✅ Environment variables documented
✅ Integration with existing Slack service

## Remaining Work

- Hook notifications into task state transitions in TasksService
- Add digest batching job to JobsService
- Implement Slack channel posting (requires channel management)
- Add email delivery tracking webhooks
- Write unit tests for notification service
- Write integration tests for email delivery
