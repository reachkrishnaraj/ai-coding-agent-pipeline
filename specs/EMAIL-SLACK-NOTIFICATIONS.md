# EMAIL & SLACK NOTIFICATIONS — Comprehensive Requirements Specification

**Version:** 1.0
**Status:** Requirements Document
**Date:** February 15, 2026
**Project:** AI Coding Pipeline
**Tech Stack:** NestJS 11, TypeScript 5, Mongoose 8, MongoDB 7, React + Vite, SendGrid/Resend, Slack API

---

## 1. Overview

### 1.1 Problem Statement

Currently, the AI Pipeline has basic Slack DM notifications for key task events. Users receive no email notifications and have limited visibility into notification preferences. As the system scales, users need:

- **Multiple notification channels**: Email and Slack (DMs + team channels)
- **Granular control**: Per-event notification preferences
- **Quiet hours**: Time-based muting for non-urgent notifications
- **Audit trail**: History of all notifications sent
- **Batching/Digests**: Option to batch multiple notifications into hourly/daily summaries
- **One-click unsubscribe**: Email compliance (CAN-SPAM, GDPR)
- **Rich formatting**: HTML emails with buttons/links, Slack rich messages with blocks
- **User preferences persistence**: Stored in database, managed via Web UI

### 1.2 Goals

1. Enable multi-channel notifications (Email + Slack DMs + Slack channel posts)
2. Give users complete control over which events trigger notifications
3. Support quiet hours and delivery time preferences
4. Provide comprehensive audit trail of all notifications
5. Support digest/batching mode for reduced notification fatigue
6. Ensure GDPR/CAN-SPAM compliance with easy unsubscribe
7. Reduce context switching with rich, informative messages

### 1.3 Success Criteria

- Users can enable/disable notifications per event type
- Users can choose which channels to receive notifications on
- Email unsubscribe link works in all emails
- Slack messages use rich formatting with action buttons
- Quiet hours prevent notifications outside configured times
- Notification audit log shows all sent messages with delivery status
- Digest mode successfully batches and sends summaries
- All new notifications are sent within 60 seconds of event trigger
- Email delivery success rate > 98%

---

## 2. User Stories

### 2.1 As a Product Manager

**US-101:** I want to receive email summaries of all task activity twice daily (8 AM and 5 PM) instead of individual messages, so I can stay informed without notification overload.

**Acceptance Criteria:**
- Notification preferences allow digest mode (hourly, daily, or real-time)
- Emails are sent at configured times (morning and evening digests)
- Digest subject line shows task count: "AI Pipeline Digest: 5 tasks completed today"
- Each digest includes all task events from the batch period

---

### 2.2 As a Team Lead

**US-102:** I want my team's AI Pipeline activity posted to a Slack channel (#ai-tasks) instead of just DMs, so the whole team stays informed.

**Acceptance Criteria:**
- Notification preferences allow selecting team channel for certain events
- Channel notifications use Slack threads to keep conversations organized
- Include @mentions for task creators in important updates
- Team members can enable/disable personal DMs while keeping channel posts

---

### 2.3 As a Developer Submitting a Task

**US-103:** I don't want to be bothered with notifications between 6 PM and 9 AM on weekdays, so I can have uninterrupted personal time.

**Acceptance Criteria:**
- Notification preferences include "Quiet Hours" setting (start time, end time, days)
- Notifications triggered during quiet hours are queued and delivered at quiet hours end
- Urgent notifications can optionally bypass quiet hours
- Current quiet hours status is shown in Web UI

---

### 2.4 As a Data Privacy Officer

**US-104:** I need a one-click unsubscribe link in every email so we remain GDPR and CAN-SPAM compliant.

**Acceptance Criteria:**
- Every email includes unsubscribe link in footer
- Unsubscribe link redirects to a page where user can resubscribe
- Unsubscribe action is logged in audit trail
- API endpoint validates unsubscribe token before processing

---

### 2.5 As an Agent Reviewer

**US-105:** I want detailed task notifications only, not every minor event, so I can focus on actionable updates.

**Acceptance Criteria:**
- User can disable notifications for minor events (task created, analyzing)
- User can enable notifications for important events (dispatched, PR opened, PR merged)
- User can choose different channels for different event types
- UI shows which events are currently enabled

---

### 2.6 As a DevOps Engineer

**US-106:** I want to know when tasks fail so I can investigate, but I don't want to miss these notifications.

**Acceptance Criteria:**
- "Task failed" notifications bypass quiet hours by default (configurable)
- Failed task notifications include error details
- "PR closed/rejected" notifications are sent to both email and Slack immediately
- Notification includes link to task detail page for investigation

---

### 2.7 As a System Administrator

**US-107:** I want a complete audit log of all notifications sent so I can debug delivery issues and meet compliance requirements.

**Acceptance Criteria:**
- NotificationLog collection tracks every notification sent
- Log includes: recipient, channel, event type, delivery status, timestamp, error message (if failed)
- Admin API endpoint provides filtered search (date range, recipient, status)
- Log retention policy: 90 days minimum, archive after 1 year

---

## 3. Notification Events & Triggers

Each event can trigger multiple notifications based on user preferences.

### 3.1 Task Created
**Triggers when:** User submits task via Web UI, Slack, or API
**Event Type:** `task_created`
**Channels Available:** Email, Slack DM
**Default:** Disabled (optional)
**Payload:**
```json
{
  "taskId": "...",
  "description": "Fix payment status bug",
  "repo": "mothership/finance-service",
  "source": "web|slack|api",
  "priority": "normal|urgent"
}
```

---

### 3.2 Task Needs Clarification
**Triggers when:** LLM analysis returns `clear_enough: false`
**Event Type:** `task_clarification_needed`
**Channels Available:** Email, Slack DM (thread)
**Default:** Enabled (blocking)
**Bypass Quiet Hours:** Yes (blocking)
**Payload:**
```json
{
  "taskId": "...",
  "description": "Fix payment status bug",
  "questions": ["Q1", "Q2", "Q3"],
  "dashboardLink": "https://ai-pipeline.app/tasks/{taskId}"
}
```

---

### 3.3 Task Dispatched (Issue Created)
**Triggers when:** GitHub issue created successfully
**Event Type:** `task_dispatched`
**Channels Available:** Email, Slack DM, Slack channel
**Default:** Enabled
**Payload:**
```json
{
  "taskId": "...",
  "summary": "Fix Stripe webhook handler to update payment status",
  "agent": "claude-code|codex|copilot",
  "repo": "mothership/finance-service",
  "issueNumber": 42,
  "issueUrl": "https://github.com/mothership/finance-service/issues/42",
  "estimatedDuration": "1-2 hours"
}
```

---

### 3.4 PR Opened (Ready for Review)
**Triggers when:** GitHub webhook receives `pull_request.opened` from agent
**Event Type:** `pr_opened`
**Channels Available:** Email, Slack DM, Slack channel
**Default:** Enabled
**Payload:**
```json
{
  "taskId": "...",
  "summary": "Fix Stripe webhook handler...",
  "agent": "claude-code",
  "prNumber": 43,
  "prUrl": "https://github.com/mothership/finance-service/pull/43",
  "prTitle": "Fix Stripe webhook handler to update payment status",
  "commitCount": 3,
  "filesChanged": 2,
  "additions": 45,
  "deletions": 8
}
```

---

### 3.5 PR Merged (Task Complete)
**Triggers when:** GitHub webhook receives `pull_request.closed` with `merged: true`
**Event Type:** `pr_merged`
**Channels Available:** Email, Slack DM, Slack channel
**Default:** Enabled
**Payload:**
```json
{
  "taskId": "...",
  "summary": "Fix Stripe webhook handler...",
  "prNumber": 43,
  "prUrl": "https://github.com/mothership/finance-service/pull/43",
  "mergedBy": "some-github-user",
  "mergedAt": "2026-02-15T14:30:00Z",
  "timeToComplete": "2 hours 15 minutes"
}
```

---

### 3.6 PR Closed/Rejected (Not Merged)
**Triggers when:** GitHub webhook receives `pull_request.closed` with `merged: false`
**Event Type:** `pr_closed`
**Channels Available:** Email, Slack DM, Slack channel
**Default:** Enabled (urgent)
**Bypass Quiet Hours:** Yes
**Payload:**
```json
{
  "taskId": "...",
  "summary": "Fix Stripe webhook handler...",
  "prNumber": 43,
  "prUrl": "https://github.com/mothership/finance-service/pull/43",
  "closedBy": "some-github-user",
  "closedAt": "2026-02-15T14:30:00Z",
  "reason": "Changes requested",
  "reviewComments": ["Comment 1", "Comment 2"]
}
```

---

### 3.7 Task Failed (LLM or GitHub Error)
**Triggers when:** Task reaches `failed` status (LLM error, GitHub error, etc.)
**Event Type:** `task_failed`
**Channels Available:** Email, Slack DM
**Default:** Enabled (urgent)
**Bypass Quiet Hours:** Yes
**Payload:**
```json
{
  "taskId": "...",
  "description": "Fix payment status bug",
  "errorType": "github_api_error|llm_parse_error|rate_limited",
  "errorMessage": "GitHub API returned 422: Invalid value for state",
  "timestamp": "2026-02-15T14:30:00Z",
  "retryLink": "https://ai-pipeline.app/tasks/{taskId}/retry",
  "supportLink": "https://ai-pipeline.app/help"
}
```

---

### 3.8 Agent Asked a Question (Issue Comment by Agent)
**Triggers when:** GitHub webhook receives issue comment (agent asking for clarification)
**Event Type:** `agent_question`
**Channels Available:** Email, Slack DM (thread)
**Default:** Enabled (blocking)
**Bypass Quiet Hours:** Yes (blocking)
**Payload:**
```json
{
  "taskId": "...",
  "summary": "Fix Stripe webhook handler...",
  "question": "What is the current behavior when webhook fires without signature?",
  "issueNumber": 42,
  "commentUrl": "https://github.com/mothership/finance-service/issues/42#issuecomment-1234567890",
  "dashboardLink": "https://ai-pipeline.app/tasks/{taskId}"
}
```

---

### 3.9 Task Clarification Answers Submitted
**Triggers when:** User provides answers to clarification questions
**Event Type:** `task_clarified`
**Channels Available:** Email, Slack DM
**Default:** Disabled (internal)
**Payload:**
```json
{
  "taskId": "...",
  "description": "Fix payment status bug",
  "answerCount": 2,
  "summary": "User clarified: (1) stays as Processing, (2) no error logs"
}
```

---

## 4. Notification Channels

### 4.1 Email Notifications

#### Provider Options

1. **SendGrid** (Recommended)
   - Cost: $0.10 per email after free tier (100 emails/day)
   - Setup: Simple API integration
   - Features: Templates, bounce handling, delivery tracking
   - Environment variable: `SENDGRID_API_KEY`

2. **AWS SES**
   - Cost: $0.10 per 1,000 emails
   - Setup: Requires AWS account, domain verification
   - Features: SPF/DKIM setup, bounce handling, compliance
   - Environment variables: `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

3. **Resend**
   - Cost: $0.20 per email (with free tier)
   - Setup: Simple API, React Email SDK available
   - Features: Transactional emails, templates, delivery tracking
   - Environment variable: `RESEND_API_KEY`

#### Email Features

- **HTML templates** for each event type
- **Plain-text fallback** for email clients
- **Unsubscribe link** in footer (required by CAN-SPAM)
- **Tracking pixel** (optional): `img` tag with transparent GIF to track opens
- **One-click unsubscribe token** (RFC 8058): `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header

#### Email Delivery Status

- Track three states: **sent**, **delivered**, **bounced**
- Store in `NotificationLog` collection
- Set up webhook listener for bounce/complaint events
- Auto-unsubscribe users with hard bounces
- Retry soft bounces up to 3 times

---

### 4.2 Slack DM (Direct Message)

#### Capabilities

- **Rich formatting** using Slack Block Kit
- **Buttons & links**: Action buttons to open task details, approve, etc.
- **Threaded replies**: Keep Q&A in organized threads
- **Mention-able users**: @mentions for task creators
- **User lookup**: Map Slack ID to GitHub username for email resolution

#### Slack Message Blocks

Standard format for all Slack DM notifications:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Task Status Update",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix payment status bug\n*Status:* PR Opened\n*Agent:* Claude Code"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Repo:*\nmothership/finance-service"
        },
        {
          "type": "mrkdwn",
          "text": "*Priority:*\nNormal"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}",
          "action_id": "view_task"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View PR",
            "emoji": true
          },
          "url": "https://github.com/...",
          "action_id": "view_pr"
        }
      ]
    },
    {
      "type": "divider"
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Update sent from AI Pipeline | <https://ai-pipeline.app/settings/notifications|Manage preferences>"
        }
      ]
    }
  ]
}
```

---

### 4.3 Slack Channel Posts

#### Use Cases

- Team-wide visibility on task progress
- #ai-tasks channel: "Task dispatched", "PR opened", "PR merged"
- #alerts channel (optional): "Task failed", "PR rejected"
- Threaded conversations keep channels organized

#### Channel Notification Rules

- Only enabled if user specifies in preferences
- Post in configured channel (e.g., #ai-tasks)
- Use threads to keep main channel clean
- Include task creator mention: "Task for @john-doe completed"
- Only notify for important events by default (dispatched, pr_opened, pr_merged, pr_closed, task_failed)

---

## 5. User Preferences System

### 5.1 Notification Preferences Data Model

**Collection:** `notification_preferences`

```typescript
interface NotificationPreference {
  _id: ObjectId;
  userId: string;                        // GitHub username or Slack user ID
  email: string;                         // Primary email address

  // Channel configuration
  channels: {
    email: {
      enabled: boolean;
      address: string;
      digestMode: 'real-time' | 'hourly' | 'daily';
      digestTimes?: {
        morning: '08:00';                 // HH:MM in user's timezone
        evening: '17:00';
      };
    };
    slack_dm: {
      enabled: boolean;
      slackUserId: string;
    };
    slack_channel: {
      enabled: boolean;
      channelId: string;
      channelName: string;
      eventTypesOnly?: string[];          // Only notify for these events
    };
  };

  // Quiet hours
  quietHours: {
    enabled: boolean;
    startTime: '18:00';                   // HH:MM in user's timezone
    endTime: '09:00';
    daysOfWeek: number[];                 // 0=Sunday, 6=Saturday
    bypassForUrgent: boolean;             // Allow urgent events to bypass
  };

  // Event-level preferences
  eventPreferences: {
    task_created: boolean;
    task_clarification_needed: boolean;
    task_dispatched: boolean;
    pr_opened: boolean;
    pr_merged: boolean;
    pr_closed: boolean;
    task_failed: boolean;
    agent_question: boolean;
    task_clarified: boolean;
  };

  // Unsubscribe
  unsubscribed: {
    email: boolean;
    slackDm: boolean;
    slackChannel: boolean;
    unsubscribedAt?: Date;
    reason?: string;
  };
  unsubscribeToken: string;               // Secure token for one-click unsubscribe

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  timezone: string;                       // e.g., 'America/New_York'
}
```

### 5.2 Default Preferences

When a user first logs in:

```typescript
{
  channels: {
    email: {
      enabled: true,
      address: '{github_email}',
      digestMode: 'real-time'
    },
    slack_dm: {
      enabled: true,
      slackUserId: '{slack_id}'
    },
    slack_channel: {
      enabled: false
    }
  },
  quietHours: {
    enabled: false
  },
  eventPreferences: {
    task_created: false,                  // Opt-in
    task_clarification_needed: true,      // Always on (blocking)
    task_dispatched: true,
    pr_opened: true,
    pr_merged: true,
    pr_closed: true,                      // Urgent
    task_failed: true,                    // Urgent
    agent_question: true,                 // Always on (blocking)
    task_clarified: false
  },
  unsubscribed: {
    email: false,
    slackDm: false,
    slackChannel: false
  },
  timezone: 'UTC'
}
```

### 5.3 Preference Constraints

1. **Blocking Events** (cannot be disabled):
   - `task_clarification_needed` — user must answer to proceed
   - `agent_question` — user must respond

2. **Urgent Events** (bypass quiet hours by default):
   - `pr_closed` — PR rejected needs immediate attention
   - `task_failed` — errors need investigation
   - `agent_question` — user action required

3. **Channel Rules**:
   - At least one channel must be enabled for each event
   - If all channels disabled, system defaults to email
   - Slack DM cannot be disabled if task created via Slack

---

## 6. Email Templates

### 6.1 Template Structure

**Framework:** Use `React Email` (from Resend) for easy JSX-based templates.
**Location:** `/src/notifications/email-templates/`
**Language:** TypeScript + React

#### Common Footer (All Emails)

```html
<footer style="background-color: #f5f5f5; padding: 20px; margin-top: 40px; font-size: 12px; color: #666;">
  <p>
    <a href="{dashboardLink}" style="color: #0066cc;">View in AI Pipeline</a> |
    <a href="{settingsLink}" style="color: #0066cc;">Manage notifications</a> |
    <a href="{unsubscribeLink}" style="color: #cc0000;">Unsubscribe</a>
  </p>
  <p style="margin-top: 10px;">
    © 2026 Mothership AI Pipeline. All rights reserved.<br/>
    {companyAddress}
  </p>
  <p style="margin-top: 10px; font-size: 11px; color: #999;">
    List-Unsubscribe: &lt;{unsubscribeLink}&gt;, &lt;mailto:{supportEmail}&gt;?subject=unsubscribe
  </p>
</footer>
```

#### Unsubscribe Header (All Emails)

```
List-Unsubscribe: <https://ai-pipeline.app/notifications/unsubscribe/{token}>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

---

### 6.2 Email Template: Task Created

**Template File:** `task-created.email.ts`
**Subject:** `[AI Pipeline] New task: {taskSummary}`
**Triggered by:** `task_created` event

**Content:**

```
Subject: [AI Pipeline] New task: Fix payment status bug

From: noreply@ai-pipeline.app
To: {userEmail}

Your new AI coding task has been submitted and is being analyzed.

Task: Fix payment status bug
Repository: mothership/finance-service
Status: Analyzing...
Source: Web UI / Slack / API

What happens next:
1. Our LLM will analyze the task for clarity
2. If we need clarification, you'll receive follow-up questions
3. Once clear, we'll create a GitHub Issue
4. An AI agent (Claude Code, Codex, or Copilot) will be assigned based on complexity

You can track progress at: https://ai-pipeline.app/tasks/{taskId}

---
[Unsubscribe] [Manage preferences]
```

---

### 6.3 Email Template: Task Needs Clarification

**Template File:** `task-clarification-needed.email.ts`
**Subject:** `⚠️ [AI Pipeline] We need clarification on your task`
**Triggered by:** `task_clarification_needed` event
**Priority:** URGENT (bypass quiet hours, always deliver)

**Content:**

```
Subject: ⚠️ [AI Pipeline] We need clarification on your task

From: noreply@ai-pipeline.app
To: {userEmail}

Before we can dispatch your task to an agent, we need you to clarify a few things.

Original Task: Fix payment status bug

Questions:

1. What is the current payment status value when the webhook fires?

2. Are there any error logs when this happens?

3. Should this fix also apply to subscription payments?

Please answer these questions here: https://ai-pipeline.app/tasks/{taskId}

Or reply directly to this email with your answers.

Once you clarify, we'll immediately dispatch your task to our agents.

---
[View Task] [Manage preferences] [Unsubscribe]
```

---

### 6.4 Email Template: Task Dispatched

**Template File:** `task-dispatched.email.ts`
**Subject:** `✅ [AI Pipeline] Task dispatched to {agent}`
**Triggered by:** `task_dispatched` event

**Content:**

```
Subject: ✅ [AI Pipeline] Task dispatched to Claude Code

From: noreply@ai-pipeline.app
To: {userEmail}

Great news! Your task has been analyzed and is now assigned to an AI agent.

Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
Agent: Claude Code
Task Type: Bug fix
Estimated Duration: 1-2 hours

What's next:
- The agent will work on your task and push changes to a new branch
- You'll receive a notification when the PR is ready for review
- Review and merge the PR in GitHub

Track progress here: https://ai-pipeline.app/tasks/{taskId}
GitHub Issue: https://github.com/mothership/finance-service/issues/42

---
[View Task] [View Issue] [Manage preferences] [Unsubscribe]
```

---

### 6.5 Email Template: PR Opened (Ready for Review)

**Template File:** `pr-opened.email.ts`
**Subject:** `📝 [AI Pipeline] PR ready for review: {prTitle}`
**Triggered by:** `pr_opened` event

**Content:**

```
Subject: 📝 [AI Pipeline] PR ready for review: Fix Stripe webhook handler

From: noreply@ai-pipeline.app
To: {userEmail}

A pull request has been opened and is ready for your review!

Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
Agent: Claude Code
PR Number: #43

Summary:
{prTitle}

Changes:
- 3 commits
- 2 files changed
- 45 additions, 8 deletions

Action Items:
1. Review the code changes
2. Verify the test results
3. Merge if satisfied (or request changes)

Review the PR: https://github.com/mothership/finance-service/pull/43
View task: https://ai-pipeline.app/tasks/{taskId}

---
[View PR] [View Task] [Manage preferences] [Unsubscribe]
```

---

### 6.6 Email Template: PR Merged (Complete)

**Template File:** `pr-merged.email.ts`
**Subject:** `🎉 [AI Pipeline] Task complete! PR merged`
**Triggered by:** `pr_merged` event

**Content:**

```
Subject: 🎉 [AI Pipeline] Task complete! PR merged

From: noreply@ai-pipeline.app
To: {userEmail}

Your task has been successfully completed and merged into the main branch!

Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
Agent: Claude Code
PR Number: #43
Merged By: {mergedBy}
Time to Complete: 2 hours 15 minutes

Next Steps:
- Monitor the main branch for deployment
- Verify the fix in production
- Close the GitHub issue (or it will auto-close)

View completed task: https://ai-pipeline.app/tasks/{taskId}
View merged PR: https://github.com/mothership/finance-service/pull/43

---
[View Task] [View PR] [Manage preferences] [Unsubscribe]
```

---

### 6.7 Email Template: PR Closed/Rejected

**Template File:** `pr-closed.email.ts`
**Subject:** `⚠️ [AI Pipeline] PR needs attention: {reason}`
**Triggered by:** `pr_closed` event
**Priority:** URGENT (bypass quiet hours)

**Content:**

```
Subject: ⚠️ [AI Pipeline] PR needs attention: Changes requested

From: noreply@ai-pipeline.app
To: {userEmail}

A pull request on your task was closed without merging. Review details below.

Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
PR Number: #43
Closed By: {closedBy}
Reason: Changes requested

Review Comments:
1. "The error handling should also catch timeout errors"
2. "Add a unit test for the webhook validation"

Next Steps:
1. Review the comments on the PR
2. Discuss with the agent if needed (open a GitHub issue comment)
3. Either reopen the PR with changes or request the agent to revise

View task: https://ai-pipeline.app/tasks/{taskId}
View PR: https://github.com/mothership/finance-service/pull/43

---
[View Task] [View PR] [Manage preferences] [Unsubscribe]
```

---

### 6.8 Email Template: Task Failed

**Template File:** `task-failed.email.ts`
**Subject:** `❌ [AI Pipeline] Task failed: {errorType}`
**Triggered by:** `task_failed` event
**Priority:** URGENT (bypass quiet hours)

**Content:**

```
Subject: ❌ [AI Pipeline] Task failed: GitHub API error

From: noreply@ai-pipeline.app
To: {userEmail}

Unfortunately, your task encountered an error and needs attention.

Task: Fix payment status bug
Repository: mothership/finance-service
Status: Failed
Error Type: GitHub API error
Timestamp: 2026-02-15 14:30 UTC

Error Details:
GitHub API returned 422: Invalid value for state.
The repository may have branch protection rules that prevent issue creation.

What You Can Do:
1. Check the GitHub repository settings
2. Verify your API token has the correct permissions
3. Try again using the Retry button below

Retry: https://ai-pipeline.app/tasks/{taskId}/retry
View task: https://ai-pipeline.app/tasks/{taskId}
Get help: https://ai-pipeline.app/help

---
[Retry Task] [View Task] [Get Help] [Manage preferences] [Unsubscribe]
```

---

### 6.9 Email Template: Agent Question

**Template File:** `agent-question.email.ts`
**Subject:** `❓ [AI Pipeline] Agent has a question about your task`
**Triggered by:** `agent_question` event
**Priority:** URGENT (bypass quiet hours, always deliver)

**Content:**

```
Subject: ❓ [AI Pipeline] Agent has a question about your task

From: noreply@ai-pipeline.app
To: {userEmail}

The agent working on your task has a question that needs clarification.

Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
Agent: Claude Code
Issue Number: #42

Question:
"What is the current behavior when webhook fires without signature verification?
Should we reject the request or log a warning?"

Please provide your answer here: https://ai-pipeline.app/tasks/{taskId}
Or reply to the GitHub issue: https://github.com/mothership/finance-service/issues/42

Your prompt response will help the agent move forward quickly.

---
[Answer Question] [View Issue] [Manage preferences] [Unsubscribe]
```

---

### 6.10 Email Template: Daily Digest

**Template File:** `digest-daily.email.ts`
**Subject:** `📊 [AI Pipeline] Daily digest — {date} ({count} events)`
**Triggered by:** Scheduled, when digest window closes

**Content:**

```
Subject: 📊 [AI Pipeline] Daily digest — February 15, 2026 (8 events)

From: noreply@ai-pipeline.app
To: {userEmail}

Your daily summary of AI Pipeline activity.

---

TASKS CREATED (2)
1. Fix payment status bug (mothership/finance-service) — HIGH priority
2. Add refund email notification (mothership/finance-service)

TASKS DISPATCHED (3)
1. Fix Stripe webhook handler → assigned to Claude Code
2. Add email notification template → assigned to Codex
3. Refactor Task schema → assigned to Claude Code

PRS OPENED (2)
1. Fix Stripe webhook handler (mothership/finance-service, PR #43)
2. Add email notification template (mothership/finance-service, PR #44)

PRS MERGED (1)
1. Fix payment status validation (mothership/finance-service, PR #42) ✅

ALERTS (0)
- No failed tasks or rejected PRs

---

Summary:
- Total events: 8
- Completed tasks: 1
- In progress: 5
- Pending clarification: 0

View all: https://ai-pipeline.app/tasks
Dashboard: https://ai-pipeline.app

---
[View Dashboard] [Manage preferences] [Unsubscribe]
```

---

## 7. Slack Message Formatting

### 7.1 Task Created (Slack DM)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "New Task Submitted",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix payment status bug\n*Status:* Analyzing...\n*Repository:* mothership/finance-service"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Source:*\nWeb UI"
        },
        {
          "type": "mrkdwn",
          "text": "*Priority:*\nNormal"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

### 7.2 Task Clarification Needed (Slack DM Thread)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "⚠️ *Clarification Needed*\n\nBefore I can dispatch your task, I need clarification on a few points."
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Your Task:*\nFix payment status not updating to Succeeded after Stripe webhook fires"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Questions:*\n\n1️⃣ What is the current payment status value when the webhook fires?\n\n2️⃣ Are there any error logs when this happens?\n\n3️⃣ Should this fix also apply to subscription payments?"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Please reply in this thread with your answers. You can number them (1, 2, 3) or just answer line by line."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Answer in Dashboard",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

### 7.3 Task Dispatched (Slack DM)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ *Task Dispatched*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix Stripe webhook handler to update payment status\n*Repository:* mothership/finance-service\n*Agent:* Claude Code 🤖\n*Task Type:* Bug fix\n*Estimated Duration:* 1-2 hours"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Issue:*\n#42"
        },
        {
          "type": "mrkdwn",
          "text": "*Status:*\nCoding in progress..."
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View in AI Pipeline",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View GitHub Issue",
            "emoji": true
          },
          "url": "https://github.com/mothership/finance-service/issues/42"
        }
      ]
    }
  ]
}
```

### 7.4 PR Opened (Slack DM)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "📝 *PR Ready for Review*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*PR:* Fix Stripe webhook handler to update payment status\n*Repository:* mothership/finance-service\n*Agent:* Claude Code 🤖\n*PR Number:* #43"
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Commits:*\n3"
        },
        {
          "type": "mrkdwn",
          "text": "*Files Changed:*\n2"
        },
        {
          "type": "mrkdwn",
          "text": "*Additions:*\n+45"
        },
        {
          "type": "mrkdwn",
          "text": "*Deletions:*\n-8"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "Ready to review and merge. All tests passed."
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Review PR",
            "emoji": true
          },
          "url": "https://github.com/mothership/finance-service/pull/43"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

### 7.5 PR Merged (Slack DM)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🎉 *Task Complete! PR Merged*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix Stripe webhook handler to update payment status\n*Repository:* mothership/finance-service\n*PR:* #43\n*Merged By:* John Doe\n*Time to Complete:* 2 hours 15 minutes ⏱️"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Changes are now in production. Verify the fix is working correctly."
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View PR",
            "emoji": true
          },
          "url": "https://github.com/mothership/finance-service/pull/43"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

### 7.6 PR Closed/Rejected (Slack DM)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "⚠️ *PR Needs Attention*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix Stripe webhook handler to update payment status\n*Repository:* mothership/finance-service\n*PR:* #43\n*Closed By:* Jane Reviewer\n*Reason:* Changes requested"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Review Comments:*\n• \"The error handling should also catch timeout errors\"\n• \"Add a unit test for the webhook validation\"\n• \"Please update the PR description with testing steps\""
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Review the feedback and discuss next steps with the agent or make changes."
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View PR Discussion",
            "emoji": true
          },
          "url": "https://github.com/mothership/finance-service/pull/43"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

### 7.7 Task Failed (Slack DM)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "❌ *Task Failed*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix payment status bug\n*Repository:* mothership/finance-service\n*Error Type:* GitHub API error"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Error Details:*\nGitHub API returned 422: Invalid value for state. The repository may have branch protection rules that prevent issue creation."
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "⏰ Timestamp: 2026-02-15 14:30:00 UTC"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Retry Task",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}/retry"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "View Details",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Get Help",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/help"
        }
      ]
    }
  ]
}
```

### 7.8 Agent Question (Slack DM Thread)

```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "❓ *Agent Question*"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Task:* Fix Stripe webhook handler to update payment status\n*Agent:* Claude Code 🤖\n*Issue:* #42"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Question:*\n\"What is the current behavior when webhook fires without signature verification? Should we reject the request or log a warning?\""
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Your prompt response will help the agent move forward quickly."
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Answer in GitHub",
            "emoji": true
          },
          "url": "https://github.com/mothership/finance-service/issues/42"
        },
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Answer in Dashboard",
            "emoji": true
          },
          "url": "https://ai-pipeline.app/tasks/{taskId}"
        }
      ]
    }
  ]
}
```

---

## 8. Batching & Digest Mode

### 8.1 Digest Configuration

**Supported Modes:**

1. **Real-time** (Default)
   - Every event triggers an immediate notification
   - Notifications sent within 60 seconds

2. **Hourly Digest**
   - Events batched each hour
   - Digest sent at top of each hour (XX:00)
   - Max batch size: 50 events (if exceeded, send early)

3. **Daily Digest**
   - Events batched all day
   - Digest sent at configured time (default: 8 AM + 5 PM)
   - Separate "morning" and "evening" summaries
   - User can customize times in preferences

### 8.2 Digest Batching Logic

**Database Schema:**

```typescript
interface NotificationBatch {
  _id: ObjectId;
  userId: string;
  channel: 'email' | 'slack_dm' | 'slack_channel';
  digestMode: 'hourly' | 'daily';
  batchWindow: {
    startTime: Date;
    endTime: Date;
    label: 'morning' | 'afternoon' | 'evening' | 'hourly-02:00', etc.
  };
  notifications: Array<{
    eventType: string;
    taskId: string;
    payload: any;
    createdAt: Date;
  }>;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Digest Generation Algorithm:**

```typescript
// Hourly digest example
EVERY HOUR AT :00 {
  1. Find all pending notifications for user with digestMode='hourly'
  2. Group by (userId, channel)
  3. For each group:
     a. Count events by type
     b. Collect task IDs and summaries
     c. Generate digest email/message
     d. Send
     e. Mark batch as 'sent'
     f. Delete all notifications in batch
}

// Daily digest example
AT 08:00 AM AND 05:00 PM {
  1. Find all pending notifications since last digest time
  2. Group by (userId, channel)
  3. For each group:
     a. Generate morning or evening summary
     b. Include: task count, completed count, failed count, in-progress count
     c. Send
     d. Mark batch as 'sent'
     e. Delete all notifications in batch
}
```

### 8.3 Digest Content Example

See **Section 6.10** for daily digest email template.

---

## 9. Database Changes

### 9.1 New Collections

#### 1. NotificationPreference

```typescript
// Location: src/common/schemas/notification-preference.schema.ts
export class NotificationPreference {
  _id: ObjectId;
  userId: string;                             // GitHub username
  email: string;
  channels: {
    email: {
      enabled: boolean;
      address: string;
      digestMode: 'real-time' | 'hourly' | 'daily';
      digestTimes?: {
        morning: string;                       // HH:MM
        evening: string;
      };
    };
    slack_dm: {
      enabled: boolean;
      slackUserId: string;
    };
    slack_channel: {
      enabled: boolean;
      channelId: string;
      channelName: string;
      eventTypesOnly?: string[];
    };
  };
  quietHours: {
    enabled: boolean;
    startTime: string;                         // HH:MM
    endTime: string;
    daysOfWeek: number[];
    bypassForUrgent: boolean;
  };
  eventPreferences: Record<string, boolean>;   // task_created, task_dispatched, etc.
  unsubscribed: {
    email: boolean;
    slackDm: boolean;
    slackChannel: boolean;
    unsubscribedAt?: Date;
    reason?: string;
  };
  unsubscribeToken: string;                    // Unique secure token
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2. NotificationLog

```typescript
// Location: src/common/schemas/notification-log.schema.ts
export class NotificationLog {
  _id: ObjectId;
  taskId: string;
  userId: string;
  channel: 'email' | 'slack_dm' | 'slack_channel';
  eventType: string;
  recipient: string;                          // email or slack_user_id
  subject?: string;                           // For emails
  status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'unsubscribed';
  messageId?: string;                         // SendGrid/SES message ID
  error?: string;                             // Error message if failed
  deliveryTimestamp?: Date;                   // When confirmed delivered
  openedAt?: Date;                            // Email opened (from tracking pixel)
  clickedAt?: Date;                           // Link clicked
  metadata: {
    provider?: 'sendgrid' | 'ses' | 'resend' | 'slack';
    attempts?: number;
    lastAttempt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Indexes:
// { taskId: 1, createdAt: -1 }
// { userId: 1, createdAt: -1 }
// { status: 1, createdAt: -1 }
// { channel: 1, status: 1 }
```

#### 3. NotificationBatch (for digest mode)

```typescript
// Location: src/common/schemas/notification-batch.schema.ts
export class NotificationBatch {
  _id: ObjectId;
  userId: string;
  channel: 'email' | 'slack_dm' | 'slack_channel';
  digestMode: 'hourly' | 'daily';
  batchWindow: {
    startTime: Date;
    endTime: Date;
    label: string;                            // 'morning', 'evening', 'hourly-02:00'
  };
  notifications: Array<{
    taskId: string;
    eventType: string;
    payload: any;
    createdAt: Date;
  }>;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Indexes:
// { userId: 1, status: 1 }
// { status: 1, batchWindow.endTime: 1 }
```

### 9.2 Mongoose Schemas

**File:** `/src/common/schemas/notification-preference.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationPreferenceDocument = NotificationPreference & Document;

@Schema({ timestamps: true })
export class NotificationPreference {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({ required: true })
  email: string;

  @Prop({ type: Object })
  channels: {
    email: {
      enabled: boolean;
      address: string;
      digestMode: 'real-time' | 'hourly' | 'daily';
      digestTimes?: {
        morning: string;
        evening: string;
      };
    };
    slack_dm: {
      enabled: boolean;
      slackUserId: string;
    };
    slack_channel: {
      enabled: boolean;
      channelId?: string;
      channelName?: string;
      eventTypesOnly?: string[];
    };
  };

  @Prop({ type: Object })
  quietHours: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
    bypassForUrgent: boolean;
  };

  @Prop({ type: Object })
  eventPreferences: Record<string, boolean>;

  @Prop({ type: Object })
  unsubscribed: {
    email: boolean;
    slackDm: boolean;
    slackChannel: boolean;
    unsubscribedAt?: Date;
    reason?: string;
  };

  @Prop({ required: true, unique: true, index: true })
  unsubscribeToken: string;

  @Prop({ default: 'UTC' })
  timezone: string;
}

export const NotificationPreferenceSchema = SchemaFactory.createForClass(NotificationPreference);
```

---

## 10. API Endpoints

### 10.1 Notification Preferences

#### GET /api/notifications/preferences

Get current user's notification preferences.

**Auth:** Required (GitHub OAuth)
**Response:**
```json
{
  "userId": "john-doe",
  "email": "john@example.com",
  "channels": {
    "email": {
      "enabled": true,
      "address": "john@example.com",
      "digestMode": "real-time"
    },
    "slack_dm": {
      "enabled": true,
      "slackUserId": "U12345678"
    },
    "slack_channel": {
      "enabled": false
    }
  },
  "quietHours": {
    "enabled": true,
    "startTime": "18:00",
    "endTime": "09:00",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "bypassForUrgent": true
  },
  "eventPreferences": {
    "task_created": false,
    "task_clarification_needed": true,
    "task_dispatched": true,
    "pr_opened": true,
    "pr_merged": true,
    "pr_closed": true,
    "task_failed": true,
    "agent_question": true
  }
}
```

---

#### PUT /api/notifications/preferences

Update notification preferences.

**Auth:** Required
**Request Body:**
```json
{
  "channels": {
    "email": {
      "enabled": true,
      "digestMode": "daily",
      "digestTimes": {
        "morning": "08:00",
        "evening": "17:00"
      }
    }
  },
  "quietHours": {
    "enabled": true,
    "startTime": "18:00",
    "endTime": "09:00",
    "daysOfWeek": [1, 2, 3, 4, 5],
    "bypassForUrgent": true
  },
  "eventPreferences": {
    "task_created": false,
    "pr_opened": true
  },
  "timezone": "America/New_York"
}
```

**Response:** 200 OK with updated preferences

**Validation:**
- `startTime` and `endTime` must be valid HH:MM format
- `daysOfWeek` must be array of 0-6
- `digestMode` must be one of: real-time, hourly, daily
- All changes logged to audit trail

---

#### POST /api/notifications/preferences/reset

Reset preferences to defaults.

**Auth:** Required
**Response:** 200 OK with default preferences

---

#### GET /api/notifications/preferences/unsubscribe/{token}

Unsubscribe from all email notifications via one-click link.

**Auth:** Not required (token-based)
**Params:**
- `token` — Unsubscribe token
- `channel` (optional) — Unsubscribe from specific channel (email, slack_dm, slack_channel)

**Response:**
```json
{
  "success": true,
  "message": "You have been unsubscribed from email notifications",
  "unsubscribedChannels": ["email"],
  "resubscribeLink": "https://ai-pipeline.app/notifications/resubscribe/{token}"
}
```

**Validation:**
- Token must match stored `unsubscribeToken` in preferences
- Mark `unsubscribed.email = true` (or other channel)
- Log unsubscribe event
- Return simple HTML page with resubscribe link

---

#### POST /api/notifications/preferences/resubscribe/{token}

Resubscribe to email notifications.

**Auth:** Not required (token-based)
**Response:** 200 OK with message

---

### 10.2 Notification History

#### GET /api/notifications/history

Get notification audit log (paginated).

**Auth:** Required
**Query Params:**
- `page` — Page number (default: 1)
- `limit` — Results per page (default: 20, max: 100)
- `status` — Filter by status (sent, delivered, bounced, failed)
- `channel` — Filter by channel (email, slack_dm, slack_channel)
- `eventType` — Filter by event type
- `startDate` — ISO date string
- `endDate` — ISO date string

**Response:**
```json
{
  "logs": [
    {
      "id": "...",
      "taskId": "...",
      "eventType": "task_dispatched",
      "channel": "email",
      "recipient": "john@example.com",
      "status": "delivered",
      "subject": "✅ [AI Pipeline] Task dispatched to Claude Code",
      "deliveryTimestamp": "2026-02-15T10:05:00Z",
      "openedAt": "2026-02-15T10:15:00Z",
      "createdAt": "2026-02-15T10:00:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "limit": 20
}
```

---

#### GET /api/notifications/history/export

Export notification audit log as CSV.

**Auth:** Required
**Query Params:** Same as `/history`
**Response:** CSV file download

---

### 10.3 Notification Delivery Status

#### GET /api/notifications/delivery/{notificationId}

Get detailed delivery status for a specific notification.

**Auth:** Required
**Response:**
```json
{
  "id": "...",
  "taskId": "...",
  "channel": "email",
  "status": "delivered",
  "recipient": "john@example.com",
  "messageId": "sendgrid-msg-id-123",
  "sentAt": "2026-02-15T10:00:00Z",
  "deliveryTimestamp": "2026-02-15T10:00:05Z",
  "openedAt": "2026-02-15T10:15:00Z",
  "clickedAt": "2026-02-15T10:15:30Z",
  "clickedLink": "https://ai-pipeline.app/tasks/...",
  "bounceReason": null,
  "bounceType": null
}
```

---

### 10.4 Quiet Hours Status

#### GET /api/notifications/quiet-hours/status

Get current quiet hours status and next notification delivery time.

**Auth:** Required
**Response:**
```json
{
  "quietHoursEnabled": true,
  "isCurrentlyQuiet": true,
  "currentTime": "2026-02-15T19:30:00-05:00",
  "quietUntil": "2026-02-16T09:00:00-05:00",
  "nextDeliveryTime": "2026-02-16T09:00:00-05:00",
  "timezone": "America/New_York"
}
```

---

## 11. Frontend Changes

### 11.1 New Pages

#### /settings/notifications

Notification preferences management page.

**Components:**
- `NotificationPreferencesForm` — Channel toggles, digest mode, quiet hours
- `EventPreferencesList` — Checkbox for each event type
- `QuietHoursEditor` — Time picker, day selector
- `DigestTimeSelector` — Morning/evening time selectors (if digest enabled)
- `UnsubscribeStatus` — Show unsubscribe status with resubscribe link
- `SaveButton` with success/error toast

**Features:**
- Real-time form validation
- "Reset to defaults" button
- Display current timezone with option to change
- Show "Blocked" badge on events that cannot be disabled (task_clarification_needed, agent_question)
- Show "Urgent" badge on events that bypass quiet hours by default
- Preview quiet hours impact: "Notifications will be queued from 6 PM - 9 AM weekdays"

**API Calls:**
- `GET /api/notifications/preferences` (on mount)
- `PUT /api/notifications/preferences` (on save)
- `POST /api/notifications/preferences/reset` (on reset)

---

#### /notifications/history

Notification audit log page.

**Components:**
- `NotificationHistoryTable` — Paginated table with filters
- `HistoryFilterBar` — Status dropdown, channel filter, date range picker, event type filter
- `DeliveryStatusBadge` — Shows sent/delivered/bounced/failed with icon
- `NotificationDetails` — Modal showing full details (subject, recipient, timestamps, error)
- `ExportButton` — Download as CSV

**Columns:**
- Event Type (with icon)
- Description
- Channel
- Recipient
- Status
- Sent At
- Delivered At
- Opened At
- Actions (view details)

**Features:**
- Auto-refresh every 60 seconds
- Sort by any column
- Export filtered results as CSV
- Click row to see full details modal
- Show open rate: "X% opened" summary stat

---

### 11.2 Modified Pages

#### /tasks/:id (Task Detail Page)

**Add New Section: "Notification History"**

Show all notifications sent for this task in a timeline:

```
12:00 — Email sent (task_dispatched)
   ↳ Recipient: john@example.com
   ↳ Status: Delivered
   ↳ Opened: 12:15

12:05 — Slack DM sent (task_dispatched)
   ↳ Recipient: U12345678 (john-doe)
   ↳ Status: Delivered (read)

14:30 — Email sent (pr_opened)
   ↳ Recipient: john@example.com
   ↳ Status: Delivered
   ↳ Opened: 14:40
   ↳ Clicked: 14:42
```

**New Component:**
- `TaskNotificationHistory` — Filterable list of notifications for this task

**API Call:**
- `GET /api/notifications/history?taskId={taskId}&limit=50`

---

### 11.3 Dashboard Changes

Add notification status indicator in top navigation:

```
🔔 Notifications
  ├─ Email: ●●●●○ (enabled)
  ├─ Slack DM: ●●●●● (enabled)
  ├─ Quiet Hours: 6 PM - 9 AM (enabled)
  └─ [Go to Settings]
```

Click to open quick preferences modal (limited to most common settings).

---

## 12. Unsubscribe Implementation

### 12.1 Unsubscribe Link Generation

Every email includes:

```html
<a href="https://ai-pipeline.app/api/notifications/preferences/unsubscribe/{token}">
  Unsubscribe
</a>
```

**Token Generation:**

```typescript
// src/notifications/services/notification-preference.service.ts
private generateUnsubscribeToken(userId: string): string {
  const timestamp = Date.now();
  const randomStr = crypto.randomBytes(32).toString('hex');
  const combined = `${userId}:${timestamp}:${randomStr}`;
  return crypto
    .createHash('sha256')
    .update(combined)
    .digest('hex');
}
```

### 12.2 Unsubscribe Endpoint Behavior

```
GET /api/notifications/preferences/unsubscribe/{token}
  ↓
  1. Verify token against stored unsubscribeToken
  2. If invalid: return 404 + error page
  3. If valid:
     a. Set unsubscribed.email = true
     b. Set unsubscribedAt = now()
     c. Log unsubscribe event
     d. Return HTML page:
        - "You've been unsubscribed from email notifications"
        - Show current preferences
        - Offer quick resubscribe button
        - Link to full settings page
```

### 12.3 Resubscribe

**Button/Link:**
```html
<a href="https://ai-pipeline.app/api/notifications/preferences/resubscribe/{token}">
  Resubscribe to email notifications
</a>
```

**Behavior:**
```
POST /api/notifications/preferences/resubscribe/{token}
  ↓
  1. Verify token
  2. Set unsubscribed.email = false
  3. Log resubscribe event
  4. Redirect to settings page with success message
```

### 12.4 Email Headers (RFC 8058)

Every transactional email includes:

```
List-Unsubscribe: <https://ai-pipeline.app/api/notifications/preferences/unsubscribe/{token}>, <mailto:support@ai-pipeline.app?subject=unsubscribe>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

This allows Gmail, Outlook, and other clients to show a one-click unsubscribe button in the email header.

---

## 13. Implementation Tasks (Ordered)

### Phase 1: Foundation (Week 1)

- [ ] **Task 1.1:** Create MongoDB schemas
  - NotificationPreference
  - NotificationLog
  - NotificationBatch
  - Complexity: **Low**
  - Effort: 4 hours

- [ ] **Task 1.2:** Create DTOs for notification preferences API
  - UpdateNotificationPreferenceDto
  - NotificationHistoryQueryDto
  - Complexity: **Low**
  - Effort: 2 hours

- [ ] **Task 1.3:** Implement NotificationPreferenceService
  - CRUD operations for preferences
  - Default preferences creation
  - Unsubscribe token generation/validation
  - Timezone handling
  - Complexity: **Medium**
  - Effort: 8 hours

- [ ] **Task 1.4:** Implement NotificationLogService
  - Log notification events
  - Query audit log with filters
  - Complexity: **Low**
  - Effort: 6 hours

### Phase 2: API Endpoints (Week 1-2)

- [ ] **Task 2.1:** Create NotificationController
  - GET /api/notifications/preferences
  - PUT /api/notifications/preferences
  - POST /api/notifications/preferences/reset
  - Complexity: **Low**
  - Effort: 4 hours

- [ ] **Task 2.2:** Create PreferenceHistoryController
  - GET /api/notifications/history
  - GET /api/notifications/history/export
  - GET /api/notifications/delivery/{notificationId}
  - GET /api/notifications/quiet-hours/status
  - Complexity: **Medium**
  - Effort: 6 hours

- [ ] **Task 2.3:** Create UnsubscribeController
  - GET /api/notifications/preferences/unsubscribe/{token}
  - POST /api/notifications/preferences/resubscribe/{token}
  - Render HTML pages for unsubscribe/resubscribe
  - Complexity: **Medium**
  - Effort: 4 hours

### Phase 3: Email Integration (Week 2-3)

- [ ] **Task 3.1:** Set up email provider
  - Choose SendGrid (recommended)
  - Create EmailProvider interface + SendGridProvider
  - Test email sending
  - Complexity: **Medium**
  - Effort: 6 hours

- [ ] **Task 3.2:** Create email template rendering service
  - Set up React Email framework
  - Create base template with unsubscribe footer
  - Complexity: **Medium**
  - Effort: 8 hours

- [ ] **Task 3.3:** Implement email templates
  - task-created.email.tsx
  - task-clarification-needed.email.tsx
  - task-dispatched.email.tsx
  - pr-opened.email.tsx
  - pr-merged.email.tsx
  - pr-closed.email.tsx
  - task-failed.email.tsx
  - agent-question.email.tsx
  - digest-daily.email.tsx
  - Complexity: **Medium**
  - Effort: 16 hours

- [ ] **Task 3.4:** Create EmailNotificationService
  - Send emails for all event types
  - Handle quiet hours
  - Track delivery status
  - Implement retry logic
  - Complexity: **High**
  - Effort: 12 hours

- [ ] **Task 3.5:** Implement email delivery tracking
  - Set up webhook listener for SendGrid bounce/complaint events
  - Update NotificationLog status
  - Auto-unsubscribe on hard bounces
  - Complexity: **Medium**
  - Effort: 8 hours

### Phase 4: Slack Integration Enhancement (Week 3)

- [ ] **Task 4.1:** Enhance SlackNotificationService
  - Update to use rich Block Kit formatting
  - Implement all 8 message types (see Section 7)
  - Complexity: **Medium**
  - Effort: 12 hours

- [ ] **Task 4.2:** Implement Slack channel notifications
  - Support slack_channel in notification preferences
  - Route notifications to configured channels
  - Complexity: **Low**
  - Effort: 4 hours

### Phase 5: Batching & Digest Mode (Week 3-4)

- [ ] **Task 5.1:** Implement digest batching logic
  - Create NotificationBatchService
  - Batch notifications by user + channel + digestMode
  - Complexity: **High**
  - Effort: 16 hours

- [ ] **Task 5.2:** Create scheduled batch processor
  - Cron job: every hour for hourly digests
  - Cron job: 8 AM + 5 PM for daily digests
  - Complexity: **High**
  - Effort: 12 hours

- [ ] **Task 5.3:** Create digest email template
  - digest-daily.email.tsx (see Section 6.10)
  - digest-hourly.email.tsx
  - Complexity: **Medium**
  - Effort: 6 hours

### Phase 6: Quiet Hours Logic (Week 4)

- [ ] **Task 6.1:** Implement quiet hours enforcement
  - Check quiet hours in notification service
  - Queue notifications if in quiet hours
  - Deliver queued at quiet hours end
  - Complexity: **Medium**
  - Effort: 8 hours

- [ ] **Task 6.2:** Create quiet hours timezone handling
  - Parse user timezone from preferences
  - Convert current time to user timezone
  - Complexity: **Low**
  - Effort: 4 hours

### Phase 7: Frontend Pages (Week 4-5)

- [ ] **Task 7.1:** Create /settings/notifications page
  - NotificationPreferencesForm component
  - EventPreferencesList component
  - QuietHoursEditor component
  - Save/reset buttons
  - Complexity: **High**
  - Effort: 16 hours

- [ ] **Task 7.2:** Create /notifications/history page
  - NotificationHistoryTable component
  - HistoryFilterBar component
  - DeliveryStatusBadge component
  - NotificationDetails modal
  - ExportButton component
  - Complexity: **High**
  - Effort: 14 hours

- [ ] **Task 7.3:** Modify task detail page
  - Add TaskNotificationHistory section
  - Integrate with notification API
  - Complexity: **Medium**
  - Effort: 6 hours

- [ ] **Task 7.4:** Update dashboard navigation
  - Add notification status indicator
  - Quick preferences modal
  - Complexity: **Low**
  - Effort: 4 hours

### Phase 8: Integration & Testing (Week 5)

- [ ] **Task 8.1:** Wire up notifications to TaskService
  - Emit notification events for all state changes
  - Call NotificationService methods
  - Complexity: **Medium**
  - Effort: 8 hours

- [ ] **Task 8.2:** Write comprehensive tests
  - NotificationPreferenceService tests
  - NotificationLogService tests
  - EmailNotificationService tests
  - Quiet hours logic tests
  - Batching logic tests
  - API endpoint tests
  - Complexity: **High**
  - Effort: 20 hours

- [ ] **Task 8.3:** End-to-end testing
  - Test all notification flows
  - Verify email delivery
  - Verify Slack messages
  - Test quiet hours enforcement
  - Test digest mode
  - Complexity: **High**
  - Effort: 12 hours

- [ ] **Task 8.4:** Performance optimization
  - Add indexes to NotificationLog collection
  - Optimize batch queries
  - Cache preference lookups
  - Complexity: **Medium**
  - Effort: 6 hours

### Phase 9: Documentation & Deployment (Week 5-6)

- [ ] **Task 9.1:** Write API documentation
  - OpenAPI/Swagger specs for all endpoints
  - Example requests/responses
  - Complexity: **Low**
  - Effort: 4 hours

- [ ] **Task 9.2:** Write user documentation
  - Notification preferences guide
  - Digest mode explanation
  - Quiet hours setup guide
  - Complexity: **Low**
  - Effort: 3 hours

- [ ] **Task 9.3:** Add environment variables
  - SENDGRID_API_KEY
  - EMAIL_FROM_ADDRESS
  - NOTIFICATION_RETENTION_DAYS (default: 90)
  - Complexity: **Low**
  - Effort: 1 hour

- [ ] **Task 9.4:** Deploy and monitor
  - Deploy to Railway
  - Set up SendGrid webhook
  - Monitor email delivery
  - Complexity: **Low**
  - Effort: 4 hours

---

## 14. Estimated Complexity

### By Component

| Component | Complexity | Effort (Hours) | Risk |
|-----------|-----------|----------------|------|
| Database schemas | Low | 4 | Low |
| DTOs & Validation | Low | 2 | Low |
| NotificationPreferenceService | Medium | 8 | Low |
| NotificationLogService | Low | 6 | Low |
| API Controllers | Low | 8 | Low |
| Email provider integration | Medium | 6 | Medium |
| Email template rendering | Medium | 8 | Medium |
| Email templates (content) | Medium | 16 | Low |
| EmailNotificationService | High | 12 | High |
| Email delivery tracking | Medium | 8 | High |
| Slack Block Kit formatting | Medium | 12 | Low |
| Slack channel routing | Low | 4 | Low |
| Digest batching logic | High | 16 | High |
| Scheduled batch processor | High | 12 | High |
| Digest templates | Medium | 6 | Low |
| Quiet hours logic | Medium | 8 | Medium |
| Timezone handling | Low | 4 | Low |
| /settings/notifications page | High | 16 | Medium |
| /notifications/history page | High | 14 | Medium |
| Task detail modifications | Medium | 6 | Low |
| Dashboard modifications | Low | 4 | Low |
| TaskService integration | Medium | 8 | Medium |
| Comprehensive tests | High | 20 | Medium |
| E2E testing | High | 12 | High |
| Performance optimization | Medium | 6 | Medium |
| Documentation | Low | 7 | Low |
| **TOTAL** | **HIGH** | **~223 hours** | **Medium** |

### Overall Project Risk

**Risk Level:** MEDIUM-HIGH

**Key Risks:**
1. **Email deliverability:** ISP reputation, bounce handling, spam filtering
2. **Quiet hours timezone logic:** Off-by-one errors, DST issues
3. **Notification race conditions:** Multiple concurrent events for same task
4. **Digest batch processing:** Ensuring messages not lost during batching
5. **Slack rate limiting:** High volume of Slack messages could hit rate limits

**Mitigation:**
- Start with SendGrid (best support for transactional emails)
- Use established timezone library (moment-tz or date-fns)
- Lock-based batch processing to prevent race conditions
- Implement retry logic with exponential backoff
- Monitor Slack API rate limits and queue if needed
- Comprehensive test coverage for edge cases

---

## 15. Dependencies & Prerequisites

### External Services

1. **Email Provider** (choose one)
   - SendGrid: Free tier (100 emails/day) or paid
   - AWS SES: Requires AWS account
   - Resend: Free tier available

2. **NPM Packages**
   - `@sendgrid/mail` — for SendGrid
   - `react-email` — for email templates
   - `nodemailer` — for fallback email
   - `node-cron` — for scheduled batch jobs
   - `moment-tz` or `date-fns` — for timezone handling
   - Existing: `@slack/web-api`, `class-validator`, `mongoose`

### Frontend Dependencies

- React 18+
- Vite
- Tailwind CSS
- React Hook Form (for preferences form)
- zustand or Redux (for preference state management)
- react-toastify (for notifications)
- date-fns (for date formatting)

### Database Requirements

- MongoDB 5+ with proper indexes (see Section 9.1)
- Collections: tasks, notificationPreferences, notificationLogs, notificationBatches

---

## 16. Success Metrics & KPIs

### Delivery Metrics

- **Email delivery rate:** > 98% (target)
- **Slack delivery success rate:** > 99%
- **Notification latency:** < 60 seconds from event to notification
- **Digest accuracy:** All events in batch window included in digest

### Engagement Metrics

- **Notification open rate (email):** Target 40%+
- **Click-through rate (CTA buttons):** Target 25%+
- **User preference configuration:** 70%+ of users customize at least one setting
- **Quiet hours adoption:** 30%+ of users enable quiet hours

### Quality Metrics

- **Test coverage:** > 80% for notification services
- **Bounce rate (email):** < 2%
- **Complaint rate (email):** < 0.3%
- **Error rate:** < 0.1% for critical paths
- **Uptime:** > 99.9% for notification services

### Compliance Metrics

- **CAN-SPAM compliance:** 100% (unsubscribe link in all emails)
- **GDPR compliance:** One-click unsubscribe, data retention policies
- **Incident response:** P1 email delivery issues resolved in < 1 hour

---

## 17. Rollout Plan

### Soft Launch (Beta)

1. Deploy to staging environment
2. Enable for test users only
3. Monitor for 1 week:
   - Email delivery rates
   - Error logs
   - User feedback
4. Fix critical issues before full rollout

### Phased Rollout

**Phase 1 (Week 1):** 10% of users (internal team)
- Monitor carefully
- Collect feedback

**Phase 2 (Week 2):** 25% of users (early adopters)
- Expand monitoring
- Prepare for scaling

**Phase 3 (Week 3):** 50% of users
- Most users now enabled
- Monitor for spam complaints

**Phase 4 (Week 4):** 100% of users
- Full rollout
- Ongoing monitoring

### Rollback Plan

If critical issue discovered:
1. Disable notifications via feature flag
2. Revert to previous stable version
3. Fix issue in separate branch
4. Re-test before re-enabling
5. Post-incident review

---

## 18. Configuration Examples

### .env.example additions

```bash
# Email Provider (choose one)
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM_ADDRESS=noreply@ai-pipeline.app
EMAIL_FROM_NAME="AI Pipeline"
EMAIL_SUPPORT_ADDRESS=support@ai-pipeline.app

# Notification Configuration
NOTIFICATION_RETENTION_DAYS=90          # How long to keep audit logs
NOTIFICATION_MAX_BATCH_SIZE=50          # Max events per digest batch
NOTIFICATION_BATCH_TIMEOUT_MS=300000    # 5 minutes: send early if timeout reached
NOTIFICATION_EMAIL_TRACKING=true        # Enable open/click tracking

# Quiet Hours Defaults
QUIET_HOURS_ENABLED_BY_DEFAULT=false
QUIET_HOURS_START_TIME=18:00            # 6 PM
QUIET_HOURS_END_TIME=09:00              # 9 AM
QUIET_HOURS_BYPASS_URGENT=true

# Slack (existing)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

---

## 19. Future Enhancements

These are out of scope for V1 but good candidates for future iterations:

1. **SMS/Phone Notifications** — Ultra-urgent alerts via SMS
2. **Notification Webhooks** — Allow custom integrations (Discord, Teams, etc.)
3. **Rich Notifications** — Desktop push notifications
4. **AI-Powered Summarization** — LLM-based digest summaries
5. **Notification Analytics** — Dashboards showing notification trends
6. **Advanced Filtering** — Rule-based notification routing (e.g., "only notify for finance-service tasks")
7. **Notification Templates** — Allow users to customize email/message content
8. **Bulk Operations** — Admin ability to send announcements to all users
9. **Notification Scheduling** — Schedule notifications for specific dates/times
10. **Notification Preferences Import/Export** — Backup and restore settings

---

## 20. Glossary

- **Digest Mode:** Batching of multiple notification events into a single summary email/message
- **Quiet Hours:** Time window when notifications are queued and delivered at the window's end
- **Event Type:** Category of task event (task_created, pr_opened, pr_merged, etc.)
- **Notification Channel:** Medium of delivery (email, Slack DM, Slack channel)
- **Unsubscribe Token:** Secure, unique token for one-click email unsubscribe (RFC 8058)
- **Blocking Event:** Event that the user cannot disable (task_clarification_needed, agent_question)
- **Urgent Event:** Event that bypasses quiet hours by default (pr_closed, task_failed, agent_question)
- **Notification Batch:** Group of notifications combined into a digest (hourly or daily)
- **Delivery Status:** State of a sent notification (sent, delivered, bounced, failed)
- **Soft Bounce:** Temporary email delivery failure (retry later)
- **Hard Bounce:** Permanent email delivery failure (address invalid, auto-unsubscribe)

---

## Appendix A: Email Template Preview

Example rendered email for task_dispatched event:

```
FROM: noreply@ai-pipeline.app
TO: john@example.com
SUBJECT: ✅ [AI Pipeline] Task dispatched to Claude Code

---

✅ TASK DISPATCHED

Great news! Your task has been analyzed and is now assigned to an AI agent.

TASK DETAILS
Task: Fix Stripe webhook handler to update payment status
Repository: mothership/finance-service
Agent: Claude Code 🤖
Task Type: Bug fix
Estimated Duration: 1-2 hours

WHAT'S NEXT
- The agent will work on your task and push changes to a new branch
- You'll receive a notification when the PR is ready for review
- Review and merge the PR in GitHub

[VIEW TASK] [VIEW ISSUE] [MANAGE PREFERENCES]

---

© 2026 Mothership AI Pipeline
Mothership, Inc. | San Francisco, CA

List-Unsubscribe: <https://ai-pipeline.app/api/notifications/preferences/unsubscribe/...>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

---

## Appendix B: Test Cases

### Unit Tests

**NotificationPreferenceService:**
- [ ] Create default preferences
- [ ] Update preferences
- [ ] Generate/validate unsubscribe token
- [ ] Parse timezone correctly
- [ ] Validate quiet hours (start < end)

**NotificationLogService:**
- [ ] Log notification event
- [ ] Query by status/channel/date range
- [ ] Update delivery status
- [ ] Mark as bounced (auto-unsubscribe)

**EmailNotificationService:**
- [ ] Send email for each event type
- [ ] Respect quiet hours
- [ ] Batch notifications in digest mode
- [ ] Include unsubscribe link in all emails
- [ ] Retry on failure

**Quiet Hours Logic:**
- [ ] Detect quiet hours correctly (time of day)
- [ ] Detect quiet hours correctly (day of week)
- [ ] Bypass for urgent events
- [ ] Queue and deliver at window end

### Integration Tests

- [ ] End-to-end email delivery
- [ ] Slack message delivery
- [ ] Digest batching and sending
- [ ] Unsubscribe workflow
- [ ] Notification tracking and status updates

### E2E Tests

- [ ] User enables email notifications
- [ ] Task dispatched → email received
- [ ] User clicks unsubscribe link
- [ ] User resubscribes
- [ ] User sets quiet hours → notifications queued
- [ ] Digest mode: 5 events batched into 1 email

---

**Document Complete**

This specification provides comprehensive requirements for implementing email and Slack notifications in the AI Pipeline. Total estimated effort: ~223 hours across 40+ development tasks. Implementation should follow the phased approach in Section 13, with Phase 1 (foundation) completed before Phase 2 begins.
