# Slack Integration Module

This module handles Slack integration for the AI Pipeline, including slash commands, DM-based clarification flows, and task status notifications.

## Components

### SlackService
Core service for sending Slack messages.

**Methods:**
- `sendDM(slackUserId, text)` - Send a direct message to a user
- `sendThreadReply(channel, threadTs, text)` - Reply in a thread
- `sendTaskNotification(task, eventType)` - Send formatted status notifications
- `sendClarificationQuestions(slackUserId, taskId, questions)` - Send clarification questions as a DM

### SlackWebhookController
Handles incoming Slack webhooks.

**Endpoints:**
- `POST /api/webhooks/slack` - Receives Slack events (slash commands, thread replies)

**Features:**
- Verifies Slack request signatures using `X-Slack-Signature`
- Handles URL verification challenge (one-time Slack setup)
- Processes `/ai-task` slash command
- Handles DM thread replies for clarification answers

### SlackNotificationService
Manages task-related notifications sent to Slack users.

**Methods:**
- `notifyTaskDispatched(taskId)` - Notify when task is sent to agent
- `notifyPROpened(taskId)` - Notify when PR is ready for review
- `notifyPRMerged(taskId)` - Notify when PR is merged
- `notifyPRClosed(taskId)` - Notify when PR is closed without merge
- `notifyAgentQuestion(taskId)` - Notify when agent asks a question

## Setup

### Environment Variables
```bash
SLACK_BOT_TOKEN=xoxb-...           # Bot User OAuth Token
SLACK_SIGNING_SECRET=...           # For verifying webhook signatures
SLACK_DEFAULT_USER_ID=U0A6VN4J3PW  # Fallback user for web-submitted tasks
```

### Slack App Configuration

1. **OAuth Scopes** (in Slack App → OAuth & Permissions):
   - `chat:write` - Send DMs
   - `commands` - Slash commands
   - `im:history` - Read DM thread replies
   - `im:write` - Open DM channels

2. **Slash Commands** (in Slack App → Slash Commands):
   - Command: `/ai-task`
   - Request URL: `https://your-app.railway.app/api/webhooks/slack`
   - Short Description: "Create a new AI coding task"

3. **Event Subscriptions** (in Slack App → Event Subscriptions):
   - Request URL: `https://your-app.railway.app/api/webhooks/slack`
   - Subscribe to Bot Events:
     - `message.im` - Receive DM messages (for thread replies)

4. **Interactivity & Shortcuts** (in Slack App):
   - Request URL: `https://your-app.railway.app/api/webhooks/slack`

## Usage

### Slash Command
```
/ai-task Fix the payment status bug in finance-service
```

**Flow:**
1. User runs the slash command
2. App creates a task via TasksService
3. If clarification needed: sends DM with questions
4. User replies in thread with answers
5. App creates GitHub issue and notifies user

### Clarification Flow
When a task needs clarification:
1. App sends DM with numbered questions
2. User replies in the thread with answers (numbered list or plain text)
3. App parses answers and submits to TasksService.clarify()
4. App creates GitHub issue and notifies user with confirmation

### Notifications
Users receive automatic DM notifications for:
- Task dispatched to AI agent
- PR opened and ready for review
- PR merged successfully
- PR closed without merge
- Agent asking a question

## Security

### Signature Verification
All incoming Slack webhooks are verified using HMAC SHA-256:
1. Extract `X-Slack-Signature` and `X-Slack-Request-Timestamp` headers
2. Reject requests older than 5 minutes (replay attack prevention)
3. Compute HMAC: `v0=${hmac_sha256(signing_secret, 'v0:timestamp:body')}`
4. Compare using constant-time comparison

### Error Handling
Slack integration is **non-blocking**:
- If DM fails to send, log a warning and continue
- If Slack API is down, the core task creation flow still works
- Notifications are best-effort only

## Testing
```bash
pnpm test -- slack
```

Tests cover:
- Signature verification
- Slash command parsing
- Thread reply answer parsing
- Notification message formatting
