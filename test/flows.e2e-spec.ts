/**
 * End-to-End Flow Tests — Cross-Module Business Workflows
 *
 * Tests ENTIRE flows where outputs from one module feed into another,
 * using real MongoDB and real services, mocking only external APIs.
 *
 * Database: ai_pipeline_flow_test (separate from integration tests)
 */

// Mock ESM-only packages BEFORE any imports
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      listForAuthenticatedUser: jest.fn(),
      get: jest.fn().mockResolvedValue({
        data: {
          full_name: 'mothership/flow-test-1',
          description: 'Flow test repo',
          html_url: 'https://github.com/mothership/flow-test-1',
          private: false,
          permissions: { push: true },
        },
      }),
    },
  })),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-flow-msg' }),
  }),
}));

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: jest.fn() },
    users: { info: jest.fn() },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
  Module,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Connection } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';
import * as crypto from 'crypto';

// Schema imports
import { Task, TaskSchema } from '../src/common/schemas/task.schema';
import { TaskTemplate, TemplateSchema } from '../src/common/schemas/template.schema';
import { UserRepo, UserRepoSchema } from '../src/common/schemas/user-repo.schema';
import { User, UserSchema } from '../src/common/schemas/user.schema';
import { Reminder, ReminderSchema } from '../src/common/schemas/reminder.schema';
import {
  ReminderPreference,
  ReminderPreferenceSchema,
} from '../src/common/schemas/reminder-preference.schema';
import {
  NotificationPreference,
  NotificationPreferenceSchema,
} from '../src/common/schemas/notification-preference.schema';
import {
  NotificationLog,
  NotificationLogSchema,
} from '../src/common/schemas/notification-log.schema';
import {
  AnalyticsDaily,
  AnalyticsDailySchema,
} from '../src/common/schemas/analytics-daily.schema';
import {
  AnalyticsWeekly,
  AnalyticsWeeklySchema,
} from '../src/common/schemas/analytics-weekly.schema';

// Service imports
import { TasksService } from '../src/tasks/tasks.service';
import { TemplatesService } from '../src/templates/templates.service';
import { StatsService } from '../src/stats/stats.service';
import { DependenciesService } from '../src/dependencies/dependencies.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { EmailService } from '../src/notifications/email.service';
import { SlackService } from '../src/slack/slack.service';
import { SlackNotificationService } from '../src/slack/slack-notification.service';
import { ReposService } from '../src/repos/repos.service';

// Controller imports
import { HealthController } from '../src/tasks/health.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { TemplatesController } from '../src/templates/templates.controller';
import { StatsController } from '../src/stats/stats.controller';
import { DependenciesController } from '../src/dependencies/dependencies.controller';
import { RemindersController } from '../src/reminders/reminders.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { GitHubWebhookController } from '../src/github/github-webhook.controller';
import { ReposController } from '../src/repos/repos.controller';

// Guard imports
import { AuthGuard } from '../src/auth/auth.guard';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';

// ---------------------------------------------------------------------------
// Configurable Mock Auth Guard
// ---------------------------------------------------------------------------

let currentMockUser = {
  id: 'user-flow-admin',
  githubId: '11111',
  username: 'flowtestadmin',
  displayName: 'Flow Test Admin',
  email: 'admin@flowtest.com',
  avatarUrl: 'https://github.com/flowtestadmin.png',
  role: 'admin',
  status: 'active',
  accessToken: 'ghp_flow_test',
};

class ConfigurableMockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { ...currentMockUser };
    req.isAuthenticated = () => true;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Mock External Services
// ---------------------------------------------------------------------------

const mockLlmService = {
  analyzeTask: jest.fn(),
};

const mockGitHubService = {
  createIssue: jest.fn().mockResolvedValue({
    issueNumber: 42,
    htmlUrl: 'https://github.com/mothership/test/issues/42',
  }),
};

const mockSlackService = {
  sendDM: jest.fn().mockResolvedValue('1234567890.123456'),
  sendTaskNotification: jest.fn(),
  getUserDisplayName: jest.fn().mockResolvedValue('testuser'),
};

const mockSlackNotificationService = {
  notifyTaskDispatched: jest.fn().mockResolvedValue(undefined),
  notifyPROpened: jest.fn().mockResolvedValue(undefined),
  notifyPRMerged: jest.fn().mockResolvedValue(undefined),
  notifyPRClosed: jest.fn().mockResolvedValue(undefined),
  notifyAgentQuestion: jest.fn().mockResolvedValue(undefined),
  notifyChannel: jest.fn().mockResolvedValue(undefined),
};

const mockEmailService = {
  sendEmail: jest
    .fn()
    .mockResolvedValue({ messageId: 'test-msg-id', success: true }),
  isConfigured: jest.fn().mockReturnValue(false),
};

const mockTasksGateway = {
  emitTaskUpdate: jest.fn(),
  emitTaskStatusChanged: jest.fn(),
  emitTaskEventAdded: jest.fn(),
  emitTaskPrUpdated: jest.fn(),
  emitDashboardUpdate: jest.fn(),
  broadcastToTask: jest.fn(),
};

// ---------------------------------------------------------------------------
// Flow Test MongoDB URI
// ---------------------------------------------------------------------------

const FLOW_TEST_DB_URI =
  'mongodb://admin:admin@localhost:27017/ai_pipeline_flow_test?authSource=admin';

const WEBHOOK_SECRET = 'test-webhook-secret';

// ---------------------------------------------------------------------------
// Test Module
// ---------------------------------------------------------------------------

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
          GITHUB_TOKEN: 'ghp_test_token',
          ALLOWED_REPOS: 'mothership/',
          APP_URL: 'http://localhost:3000',
        }),
      ],
    }),
    MongooseModule.forRoot(FLOW_TEST_DB_URI),
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: TaskTemplate.name, schema: TemplateSchema },
      { name: UserRepo.name, schema: UserRepoSchema },
      { name: User.name, schema: UserSchema },
      { name: Reminder.name, schema: ReminderSchema },
      { name: ReminderPreference.name, schema: ReminderPreferenceSchema },
      { name: NotificationPreference.name, schema: NotificationPreferenceSchema },
      { name: NotificationLog.name, schema: NotificationLogSchema },
      { name: AnalyticsDaily.name, schema: AnalyticsDailySchema },
      { name: AnalyticsWeekly.name, schema: AnalyticsWeeklySchema },
    ]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [
    HealthController,
    TasksController,
    TemplatesController,
    StatsController,
    DependenciesController,
    RemindersController,
    NotificationsController,
    GitHubWebhookController,
    ReposController,
  ],
  providers: [
    TasksService,
    TemplatesService,
    StatsService,
    DependenciesService,
    RemindersService,
    NotificationsService,
    ReposService,
    // Mock external services
    { provide: 'ILlmService', useValue: mockLlmService },
    { provide: 'IGitHubService', useValue: mockGitHubService },
    { provide: SlackService, useValue: mockSlackService },
    { provide: SlackNotificationService, useValue: mockSlackNotificationService },
    { provide: 'SlackNotificationService', useValue: mockSlackNotificationService },
    { provide: EmailService, useValue: mockEmailService },
    { provide: 'TasksGateway', useValue: mockTasksGateway },
  ],
})
class IntegrationFlowTestModule {}

// ---------------------------------------------------------------------------
// Helper: Compute HMAC signature for webhook payloads
// ---------------------------------------------------------------------------

function computeWebhookSignature(payload: object): string {
  const body = JSON.stringify(payload);
  return (
    'sha256=' +
    crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  );
}

// ---------------------------------------------------------------------------
// Helper: Default LLM responses
// ---------------------------------------------------------------------------

function llmNeedsClarification(overrides: Record<string, any> = {}) {
  return {
    summary: 'Fix login bug',
    task_type: 'bug-fix',
    recommended_agent: 'claude-code',
    likely_files: ['src/auth.ts'],
    suggested_acceptance_criteria: ['Login works'],
    clear_enough: false,
    questions: ['Q1?', 'Q2?'],
    ...overrides,
  };
}

function llmClearTask(overrides: Record<string, any> = {}) {
  return {
    summary: 'Clear task summary',
    task_type: 'feature',
    recommended_agent: 'claude-code',
    likely_files: ['src/feature.ts'],
    suggested_acceptance_criteria: ['Feature works'],
    clear_enough: true,
    questions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Flow E2E Tests (Cross-Module Workflows)', () => {
  let app: INestApplication<App>;
  let connection: Connection;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [IntegrationFlowTestModule],
    })
      .overrideGuard(AuthGuard)
      .useClass(ConfigurableMockAuthGuard)
      .overrideGuard(PassportAuthGuard('session'))
      .useClass(ConfigurableMockAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    connection = app.get<Connection>(getConnectionToken());

    // Clean database before tests
    const db = connection.db;
    if (db) {
      const collections = await db.listCollections().toArray();
      for (const coll of collections) {
        await db.collection(coll.name).deleteMany({});
      }
    }
  }, 60000);

  afterAll(async () => {
    // Drop entire test database and close
    const db = connection.db;
    if (db) {
      await db.dropDatabase();
    }
    await app.close();
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to admin user by default
    currentMockUser = {
      id: 'user-flow-admin',
      githubId: '11111',
      username: 'flowtestadmin',
      displayName: 'Flow Test Admin',
      email: 'admin@flowtest.com',
      avatarUrl: 'https://github.com/flowtestadmin.png',
      role: 'admin',
      status: 'active',
      accessToken: 'ghp_flow_test',
    };
  });

  // =========================================================================
  //  Flow 1: Task Lifecycle — Clarification Path
  // =========================================================================

  describe('Flow 1: Task Lifecycle — Clarification Path', () => {
    let taskId: string;

    it('1.1: POST /api/tasks — LLM returns needs_clarification', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(
        llmNeedsClarification(),
      );

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Fix login bug', source: 'web' })
        .expect(201);

      expect(res.body.status).toBe('needs_clarification');
      expect(res.body.questions).toEqual(['Q1?', 'Q2?']);
      expect(res.body).toHaveProperty('id');
      taskId = res.body.id;
    });

    it('1.2: GET /api/tasks/:taskId — verify clarification state and events', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(res.body.status).toBe('needs_clarification');
      expect(res.body.clarificationQuestions).toEqual(['Q1?', 'Q2?']);

      // Verify event trail
      const eventTypes = res.body.events.map((e: any) => e.eventType);
      expect(eventTypes).toContain('created');
      expect(eventTypes).toContain('analyzing');
      expect(eventTypes).toContain('llm_response');
      expect(eventTypes).toContain('clarification_sent');
    });

    it('1.3: POST /api/tasks/:taskId/clarify — answers move to dispatched', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValueOnce({
        issueNumber: 42,
        htmlUrl: 'https://github.com/mothership/test/issues/42',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/clarify`)
        .send({ answers: ['Answer1', 'Answer2'] })
        .expect(200);

      expect(res.body.status).toBe('dispatched');
      expect(res.body.issue_number).toBe(42);

      // Verify LLM was called with clarificationQA
      expect(mockLlmService.analyzeTask).toHaveBeenCalledWith(
        expect.objectContaining({
          clarificationQA: [
            { question: 'Q1?', answer: 'Answer1' },
            { question: 'Q2?', answer: 'Answer2' },
          ],
        }),
      );
    });

    it('1.4: GET /api/tasks/:taskId — verify final dispatched state', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(res.body.status).toBe('dispatched');
      expect(res.body.isClarified).toBe(true);
      expect(res.body.clarificationAnswers).toEqual(['Answer1', 'Answer2']);
      expect(res.body.githubIssueNumber).toBe(42);
      expect(res.body.dispatchedAt).toBeDefined();

      const eventTypes = res.body.events.map((e: any) => e.eventType);
      expect(eventTypes).toContain('clarification_received');
      expect(eventTypes).toContain('dispatched');
    });
  });

  // =========================================================================
  //  Flow 2: Task Direct Dispatch
  // =========================================================================

  describe('Flow 2: Task Direct Dispatch', () => {
    let taskId: string;

    it('2.1: POST /api/tasks — LLM clear, dispatches directly', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValueOnce({
        issueNumber: 101,
        htmlUrl: 'https://github.com/mothership/test/issues/101',
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Add user validation to signup',
          source: 'web',
          repo: 'mothership/web-app',
        })
        .expect(201);

      expect(res.body.status).toBe('dispatched');
      expect(res.body.issue_number).toBe(101);
      expect(res.body).toHaveProperty('id');
      taskId = res.body.id;
    });

    it('2.2: GET /api/tasks/:taskId — verify direct dispatch trail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(res.body.status).toBe('dispatched');
      // No clarification questions for direct dispatch
      expect(
        !res.body.clarificationQuestions || res.body.clarificationQuestions.length === 0,
      ).toBe(true);

      const eventTypes = res.body.events.map((e: any) => e.eventType);
      expect(eventTypes).toContain('created');
      expect(eventTypes).toContain('analyzing');
      expect(eventTypes).toContain('llm_response');
      expect(eventTypes).toContain('dispatched');
      expect(eventTypes).not.toContain('clarification_sent');
    });
  });

  // =========================================================================
  //  Flow 3: Task Failure & Retry
  // =========================================================================

  describe('Flow 3: Task Failure & Retry', () => {
    let failedTaskId: string;
    let newTaskId: string;

    it('3.1: POST /api/tasks — LLM throws, task goes to failed', async () => {
      mockLlmService.analyzeTask.mockRejectedValueOnce(
        new Error('API timeout'),
      );

      // The controller will throw an error
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task that will fail', source: 'web' });

      // Find the failed task
      const listRes = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      const failedTask = listRes.body.tasks.find(
        (t: any) => t.status === 'failed' && t.description === 'Task that will fail',
      );
      expect(failedTask).toBeDefined();
      expect(failedTask.errorMessage).toContain('API timeout');
      failedTaskId = failedTask.id;
    });

    it('3.2: POST /api/tasks/:failedTaskId/retry — creates new dispatched task', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValueOnce({
        issueNumber: 200,
        htmlUrl: 'https://github.com/mothership/test/issues/200',
      });

      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${failedTaskId}/retry`)
        .expect(200);

      expect(res.body.status).toBe('dispatched');
      expect(res.body).toHaveProperty('id');
      newTaskId = res.body.id;
    });

    it('3.3: Verify both tasks exist with correct states', async () => {
      // Original task is reset to received
      const origRes = await request(app.getHttpServer())
        .get(`/api/tasks/${failedTaskId}`)
        .expect(200);
      expect(origRes.body.status).toBe('received');

      // New task is dispatched
      const newRes = await request(app.getHttpServer())
        .get(`/api/tasks/${newTaskId}`)
        .expect(200);
      expect(newRes.body.status).toBe('dispatched');
    });
  });

  // =========================================================================
  //  Flow 4: Template -> Task Pipeline
  // =========================================================================

  describe('Flow 4: Template -> Task Pipeline', () => {
    let templateId: string;

    it('4.1: POST /api/templates — create template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates')
        .send({
          name: 'Bug Report',
          description: 'Bug fix template',
          descriptionTemplate:
            'Fix {{issue}} in {{component}} module',
          variables: {
            issue: {
              label: 'Issue',
              description: 'Bug',
              example: 'null pointer',
              required: true,
            },
            component: {
              label: 'Component',
              description: 'Module',
              example: 'payment',
              required: true,
            },
          },
          visibility: 'public',
          templateType: 'custom',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Bug Report');
      templateId = res.body.id;
    });

    it('4.2: POST /api/templates/:templateId/apply — variable substitution', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/templates/${templateId}/apply`)
        .send({
          variables: { issue: 'null pointer', component: 'payment' },
        })
        .expect(201);

      expect(res.body.description).toBe(
        'Fix null pointer in payment module',
      );
    });

    it('4.3: POST /api/tasks — create task from template output', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValueOnce({
        issueNumber: 300,
        htmlUrl: 'https://github.com/mothership/test/issues/300',
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Fix null pointer in payment module',
          source: 'web',
        })
        .expect(201);

      expect(res.body.status).toBe('dispatched');
    });

    it('4.4: GET /api/templates/:templateId — verify usageCount incremented', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/templates/${templateId}`)
        .expect(200);

      expect(res.body.usageCount).toBeGreaterThanOrEqual(1);
    });

    it('4.5: POST /api/templates/:templateId/favorite + GET to verify', async () => {
      const favRes = await request(app.getHttpServer())
        .post(`/api/templates/${templateId}/favorite`)
        .expect(201);

      expect(favRes.body.favorited).toBe(true);
      expect(favRes.body.favoriteCount).toBeGreaterThanOrEqual(1);

      const getRes = await request(app.getHttpServer())
        .get(`/api/templates/${templateId}`)
        .expect(200);

      expect(getRes.body.favoriteCount).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  //  Flow 5: Dependency Blocking
  // =========================================================================

  describe('Flow 5: Dependency Blocking', () => {
    let taskAId: string;
    let taskBId: string;
    let dependencyId: string;

    it('5.1: Create Task A and Task B', async () => {
      mockLlmService.analyzeTask.mockResolvedValue(
        llmNeedsClarification(),
      );

      const resA = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task A for dependency test', source: 'web' })
        .expect(201);
      taskAId = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task B for dependency test', source: 'web' })
        .expect(201);
      taskBId = resB.body.id;
    });

    it('5.2: POST /api/tasks/:taskBId/dependencies — B depends on A', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${taskBId}/dependencies`)
        .send({
          type: 'task',
          taskId: taskAId,
          blockingBehavior: 'hard',
        })
        .expect(201);

      expect(res.body.dependencyStatus).toBe('pending');
      expect(res.body.dependencies).toBeInstanceOf(Array);
      expect(res.body.dependencies.length).toBe(1);
      dependencyId = res.body.dependencies[0].id;
    });

    it('5.3: GET /api/tasks/:taskBId/dependencies — verify blocked', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskBId}/dependencies`)
        .expect(200);

      expect(res.body.dependencies[0].currentState).toBe('pending');
      expect(res.body.canStart).toBe(false);
    });

    it('5.4: Resolve dependency and verify B is ready', async () => {
      const depService = app.get(DependenciesService);
      await depService.resolveDependency(taskBId, dependencyId);

      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskBId}/dependencies`)
        .expect(200);

      expect(res.body.dependencies[0].currentState).toBe('resolved');
      expect(res.body.canStart).toBe(true);
    });
  });

  // =========================================================================
  //  Flow 6: Circular Dependency Detection
  // =========================================================================

  describe('Flow 6: Circular Dependency Detection', () => {
    let taskAId: string;
    let taskBId: string;
    let taskCId: string;

    it('6.1: Create Tasks A, B, C', async () => {
      mockLlmService.analyzeTask.mockResolvedValue(
        llmNeedsClarification(),
      );

      const resA = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Cycle Task A', source: 'web' })
        .expect(201);
      taskAId = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Cycle Task B', source: 'web' })
        .expect(201);
      taskBId = resB.body.id;

      const resC = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Cycle Task C', source: 'web' })
        .expect(201);
      taskCId = resC.body.id;
    });

    it('6.2: A depends on B', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskAId}/dependencies`)
        .send({ type: 'task', taskId: taskBId, blockingBehavior: 'hard' })
        .expect(201);
    });

    it('6.3: B depends on C', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskBId}/dependencies`)
        .send({ type: 'task', taskId: taskCId, blockingBehavior: 'hard' })
        .expect(201);
    });

    it('6.4: C depends on A — circular detected (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${taskCId}/dependencies`)
        .send({ type: 'task', taskId: taskAId, blockingBehavior: 'hard' })
        .expect(400);

      expect(res.body.message).toMatch(/[Cc]ircular/);
    });
  });

  // =========================================================================
  //  Flow 7: Reminder Lifecycle
  // =========================================================================

  describe('Flow 7: Reminder Lifecycle', () => {
    let taskId: string;
    let reminderId: string;

    it('7.1: Create task in needs_clarification', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(
        llmNeedsClarification(),
      );

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task for reminder flow', source: 'web' })
        .expect(201);

      expect(res.body.status).toBe('needs_clarification');
      taskId = res.body.id;
    });

    it('7.2: Trigger reminder auto-creation via onTaskStatusChanged', async () => {
      const remindersService = app.get(RemindersService);

      // Fetch the full task from DB
      const taskRes = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      await remindersService.onTaskStatusChanged({
        task: { ...taskRes.body, _id: taskId } as any,
        newStatus: 'needs_clarification' as any,
      });

      // Retrieve reminder
      const remRes = await request(app.getHttpServer())
        .get('/api/reminders')
        .expect(200);

      const reminder = remRes.body.reminders.find(
        (r: any) => r.taskId === taskId && r.type === 'stuck_clarification',
      );
      expect(reminder).toBeDefined();
      reminderId = reminder._id || reminder.id;
    });

    it('7.3: POST /api/reminders/:id/snooze', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/snooze`)
        .send({ durationHours: 2 })
        .expect(201);

      expect(res.body.status).toBe('snoozed');
      expect(res.body.snoozeUntil).toBeDefined();
      // snoozeUntil should be approximately 2 hours from now
      const snoozeTime = new Date(res.body.snoozeUntil).getTime();
      const expectedTime = Date.now() + 2 * 60 * 60 * 1000;
      expect(Math.abs(snoozeTime - expectedTime)).toBeLessThan(60000); // within 1 minute
    });

    it('7.4: POST /api/reminders/:id/dismiss', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/dismiss`)
        .send({ reason: 'already_aware' })
        .expect(201);

      expect(res.body.status).toBe('dismissed');
    });

    it('7.5: POST /api/reminders/:id/undo-dismiss', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/undo-dismiss`)
        .expect(201);

      expect(res.body.status).toBe('pending');
    });
  });

  // =========================================================================
  //  Flow 8: Notification Preferences & Quiet Hours
  // =========================================================================

  describe('Flow 8: Notification Preferences & Quiet Hours', () => {
    it('8.1: GET /api/notifications/preferences — creates defaults', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .expect(200);

      expect(res.body).toHaveProperty('channels');
      expect(res.body.channels).toHaveProperty('email');
      expect(res.body.channels.email.enabled).toBe(true);
      expect(res.body).toHaveProperty('eventPreferences');
      expect(res.body).toHaveProperty('quietHours');
      expect(res.body).toHaveProperty('unsubscribeToken');
    });

    it('8.2: PATCH /api/notifications/preferences — enable quiet hours', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/notifications/preferences')
        .send({
          quietHours: {
            enabled: true,
            startTime: '22:00',
            endTime: '08:00',
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            bypassForUrgent: true,
          },
        })
        .expect(200);

      expect(res.body.quietHours.enabled).toBe(true);
      expect(res.body.quietHours.startTime).toBe('22:00');
    });

    it('8.3: GET /api/notifications/quiet-hours/status — check status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/quiet-hours/status')
        .expect(200);

      expect(res.body).toHaveProperty('quietHoursEnabled');
      expect(res.body.quietHoursEnabled).toBe(true);
      expect(res.body).toHaveProperty('isCurrentlyQuiet');
      expect(res.body).toHaveProperty('currentTime');
    });

    it('8.4: POST /api/notifications/preferences/reset — reset', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/preferences/reset')
        .expect(201);

      expect(res.body.quietHours.enabled).toBe(false);
      expect(res.body.channels.email.enabled).toBe(true);
      expect(res.body.channels.slack_dm.enabled).toBe(true);
      expect(res.body.channels.slack_channel.enabled).toBe(false);
    });

    it('8.5: GET /api/notifications/preferences — verify reset persisted', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .expect(200);

      expect(res.body.quietHours.enabled).toBe(false);
      expect(res.body.channels.email.enabled).toBe(true);
    });
  });

  // =========================================================================
  //  Flow 9: Stats with Real Data
  // =========================================================================

  describe('Flow 9: Stats with Real Data', () => {
    beforeAll(async () => {
      // Create tasks with different statuses and repos
      mockLlmService.analyzeTask.mockResolvedValue(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValue({
        issueNumber: 900,
        htmlUrl: 'https://github.com/mothership/test/issues/900',
      });

      // Task 1: dispatched on repo A
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Stats task 1',
          source: 'web',
          repo: 'mothership/stats-repo-a',
        });

      // Task 2: dispatched on repo B
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Stats task 2',
          source: 'web',
          repo: 'mothership/stats-repo-b',
        });

      // Task 3: needs clarification
      mockLlmService.analyzeTask.mockResolvedValueOnce(
        llmNeedsClarification(),
      );
      await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Stats task 3 needs clarification',
          source: 'web',
          repo: 'mothership/stats-repo-a',
        });

      // Invalidate stats cache
      const statsService = app.get(StatsService);
      statsService.invalidateCache();
    });

    it('9.1: GET /api/stats/overview — verify counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/overview?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('volume');
      expect(res.body.volume.tasksCreated).toBeGreaterThanOrEqual(3);
    });

    it('9.2: GET /api/stats/by-status — verify breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/by-status?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('byStatus');
      expect(typeof res.body.byStatus).toBe('object');
      // We should have at least dispatched and needs_clarification
      const statuses = Object.keys(res.body.byStatus);
      expect(statuses.length).toBeGreaterThanOrEqual(1);
    });

    it('9.3: GET /api/stats/by-repo — verify repos present', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/by-repo?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('byRepo');
      expect(typeof res.body.byRepo).toBe('object');
    });
  });

  // =========================================================================
  //  Flow 10: Repo Settings
  // =========================================================================

  describe('Flow 10: Repo Settings', () => {
    let repoId1: string;
    let repoId2: string;

    it('10.1: POST /api/repos { repoName: mothership/flow-test-1 }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/repos')
        .send({ repoName: 'mothership/flow-test-1' })
        .expect(201);

      // The toJSON virtual converts _id to id
      repoId1 = res.body.id || res.body._id;
      expect(repoId1).toBeDefined();
    });

    it('10.2: PATCH /api/repos/:id/settings { defaultAgent: codex }', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/repos/${repoId1}/settings`)
        .send({ defaultAgent: 'codex' })
        .expect(200);

      expect(res.body.defaultAgent).toBe('codex');
    });

    it('10.3: GET /api/repos/:id/settings — verify defaultAgent', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/repos/${repoId1}/settings`)
        .expect(200);

      expect(res.body.defaultAgent).toBe('codex');
    });

    it('10.4: POST /api/repos { repoName: mothership/flow-test-2 }', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/repos')
        .send({ repoName: 'mothership/flow-test-2' })
        .expect(201);

      repoId2 = res.body.id || res.body._id;
      expect(repoId2).toBeDefined();
    });

    it('10.5: GET /api/repos — both repos present', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/repos')
        .expect(200);

      expect(res.body.repos.length).toBeGreaterThanOrEqual(2);
      const repoNames = res.body.repos.map((r: any) => r.repoName);
      expect(repoNames).toContain('mothership/flow-test-1');
      expect(repoNames).toContain('mothership/flow-test-2');
    });

    it('10.6: DELETE /api/repos/:id — removes first repo', async () => {
      await request(app.getHttpServer())
        .delete(`/api/repos/${repoId1}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/repos')
        .expect(200);

      // First repo should be soft-deleted (isActive=false), so not in active list
      const activeRepoNames = res.body.repos.map((r: any) => r.repoName);
      expect(activeRepoNames).not.toContain('mothership/flow-test-1');
      expect(activeRepoNames).toContain('mothership/flow-test-2');
    });
  });

  // =========================================================================
  //  Flow 11: GitHub Webhook PR Flow
  // =========================================================================

  describe('Flow 11: GitHub Webhook PR Flow', () => {
    let taskId: string;

    it('11.1: Create dispatched task with issue number 500', async () => {
      mockLlmService.analyzeTask.mockResolvedValueOnce(llmClearTask());
      mockGitHubService.createIssue.mockResolvedValueOnce({
        issueNumber: 500,
        htmlUrl: 'https://github.com/mothership/finance-service/issues/500',
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Webhook test task',
          source: 'web',
          repo: 'mothership/finance-service',
        })
        .expect(201);

      expect(res.body.status).toBe('dispatched');
      expect(res.body.issue_number).toBe(500);
      taskId = res.body.id;
    });

    it('11.2: POST /api/webhooks/github — invalid signature returns 401', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 10,
          html_url: 'https://github.com/mothership/finance-service/pull/10',
          body: 'Closes #500',
          merged: false,
          state: 'open',
          user: { login: 'bot' },
        },
        repository: { full_name: 'mothership/finance-service' },
      };

      await request(app.getHttpServer())
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', 'sha256=invalid')
        .set('x-github-event', 'pull_request')
        .send(payload)
        .expect(401);
    });

    it('11.3: POST /api/webhooks/github — PR opened', async () => {
      const payload = {
        action: 'opened',
        pull_request: {
          number: 10,
          html_url: 'https://github.com/mothership/finance-service/pull/10',
          body: 'Closes #500',
          merged: false,
          state: 'open',
          user: { login: 'bot' },
        },
        repository: { full_name: 'mothership/finance-service' },
      };

      const signature = computeWebhookSignature(payload);

      await request(app.getHttpServer())
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .send(payload)
        .expect(201);

      // Verify task status updated
      const taskRes = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(taskRes.body.status).toBe('pr_open');
      expect(taskRes.body.githubPrNumber).toBe(10);
    });

    it('11.4: POST /api/webhooks/github — PR merged', async () => {
      const payload = {
        action: 'closed',
        pull_request: {
          number: 10,
          html_url: 'https://github.com/mothership/finance-service/pull/10',
          body: 'Closes #500',
          merged: true,
          state: 'closed',
          user: { login: 'bot' },
        },
        repository: { full_name: 'mothership/finance-service' },
      };

      const signature = computeWebhookSignature(payload);

      await request(app.getHttpServer())
        .post('/api/webhooks/github')
        .set('x-hub-signature-256', signature)
        .set('x-github-event', 'pull_request')
        .send(payload)
        .expect(201);

      // Verify task is merged
      const taskRes = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(taskRes.body.status).toBe('merged');
      expect(taskRes.body.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  //  Flow 12: Role-Based Access
  // =========================================================================

  describe('Flow 12: Role-Based Access', () => {
    let adminTaskId: string;
    let devTaskId: string;

    it('12.1: As admin, create a task', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'admin',
        username: 'admin-user',
      };

      mockLlmService.analyzeTask.mockResolvedValueOnce(
        llmNeedsClarification(),
      );

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Admin task', source: 'web' })
        .expect(201);

      adminTaskId = res.body.id;
    });

    it('12.2: As developer, create a task', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'developer',
        username: 'dev-user',
      };

      mockLlmService.analyzeTask.mockResolvedValueOnce(
        llmNeedsClarification(),
      );

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Dev task', source: 'web' })
        .expect(201);

      devTaskId = res.body.id;
    });

    it('12.3: As dev-user, GET /api/tasks — only sees own tasks', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'developer',
        username: 'dev-user',
      };

      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      // All tasks returned should belong to dev-user
      for (const task of res.body.tasks) {
        expect(task.createdBy).toBe('dev-user');
      }
    });

    it('12.4: As dev-user, GET /api/tasks/:adminTaskId — 403', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'developer',
        username: 'dev-user',
      };

      await request(app.getHttpServer())
        .get(`/api/tasks/${adminTaskId}`)
        .expect(403);
    });

    it('12.5: As admin, GET /api/tasks — sees both tasks', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'admin',
        username: 'admin-user',
      };

      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      const taskIds = res.body.tasks.map((t: any) => t.id);
      expect(taskIds).toContain(adminTaskId);
      expect(taskIds).toContain(devTaskId);
    });

    it('12.6: As admin, GET /api/tasks/:devTaskId — 200', async () => {
      currentMockUser = {
        ...currentMockUser,
        role: 'admin',
        username: 'admin-user',
      };

      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${devTaskId}`)
        .expect(200);

      expect(res.body.createdBy).toBe('dev-user');
    });
  });
});
