/**
 * Integration E2E Tests — Real MongoDB, Real Services, Mocked Externals
 *
 * These tests connect to a real MongoDB instance (via Docker) and exercise
 * the actual Mongoose models and service logic end-to-end.
 *
 * External services (OpenAI, GitHub API, Slack, Email) are mocked.
 */

// Mock ESM-only packages BEFORE any imports
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: {
      listForAuthenticatedUser: jest.fn(),
      get: jest.fn(),
    },
  })),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-id' }),
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
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Connection, Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

// Schema imports
import { Task, TaskSchema, TaskDocument } from '../src/common/schemas/task.schema';
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

// Controller imports
import { HealthController } from '../src/tasks/health.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { TemplatesController } from '../src/templates/templates.controller';
import { StatsController } from '../src/stats/stats.controller';
import { DependenciesController } from '../src/dependencies/dependencies.controller';
import { RemindersController } from '../src/reminders/reminders.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';

// Guard imports
import { AuthGuard } from '../src/auth/auth.guard';

// ---------------------------------------------------------------------------
// Mock Auth Guard
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-integ-123',
  githubId: '99999',
  username: 'integtestuser',
  displayName: 'Integration Test User',
  email: 'integ@test.com',
  avatarUrl: 'https://github.com/integtestuser.png',
  role: 'admin',
  status: 'active',
  accessToken: 'ghp_integration_test',
};

class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { ...mockUser };
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
  notifyTaskDispatched: jest.fn(),
  notifyChannel: jest.fn(),
};

const mockEmailService = {
  sendEmail: jest
    .fn()
    .mockResolvedValue({ messageId: 'test-msg-id', success: true }),
  isConfigured: jest.fn().mockReturnValue(false),
};

const mockTasksGateway = {
  emitTaskUpdate: jest.fn(),
  emitDashboardUpdate: jest.fn(),
  broadcastToTask: jest.fn(),
  emitTaskStatusChanged: jest.fn(),
  emitTaskEventAdded: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test MongoDB URI
// ---------------------------------------------------------------------------

const TEST_MONGODB_URI =
  'mongodb://admin:admin@localhost:27017/ai_pipeline_integration_test?authSource=admin';

// ---------------------------------------------------------------------------
// Test Module
// ---------------------------------------------------------------------------

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '.env.test', isGlobal: true }),
    MongooseModule.forRoot(TEST_MONGODB_URI),
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
  ],
  providers: [
    TasksService,
    TemplatesService,
    StatsService,
    DependenciesService,
    RemindersService,
    NotificationsService,
    // Mock external services
    { provide: 'ILlmService', useValue: mockLlmService },
    { provide: 'IGitHubService', useValue: mockGitHubService },
    { provide: SlackService, useValue: mockSlackService },
    { provide: SlackNotificationService, useValue: mockSlackNotificationService },
    { provide: EmailService, useValue: mockEmailService },
    { provide: 'TasksGateway', useValue: mockTasksGateway },
  ],
})
class IntegrationTestModule {}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Integration E2E Tests (Real MongoDB)', () => {
  let app: INestApplication<App>;
  let connection: Connection;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [IntegrationTestModule],
    })
      .overrideGuard(AuthGuard)
      .useClass(MockAuthGuard)
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
  }, 30000);

  afterAll(async () => {
    // Clean database after all tests
    const db = connection.db;
    if (db) {
      const collections = await db.listCollections().toArray();
      for (const coll of collections) {
        await db.collection(coll.name).deleteMany({});
      }
    }
    await app.close();
  }, 30000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  //  1. Health Check
  // =========================================================================

  describe('Health Check', () => {
    it('GET /api/health - returns connected status from real DB', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body).toEqual({ status: 'ok', db: 'connected' });
    });
  });

  // =========================================================================
  //  2. Tasks Full Lifecycle
  // =========================================================================

  describe('Tasks Full Lifecycle', () => {
    let taskWithQuestions: any;
    let taskDispatched: any;

    it('POST /api/tasks - creates a task that needs clarification (201)', async () => {
      // Mock LLM to return questions (clear_enough=false)
      mockLlmService.analyzeTask.mockResolvedValueOnce({
        summary: 'Fix login bug summary',
        task_type: 'bug-fix',
        recommended_agent: 'claude-code',
        likely_files: ['src/auth/login.ts'],
        suggested_acceptance_criteria: ['Login should work'],
        clear_enough: false,
        questions: ['Which login page?', 'What browser?'],
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Fix login bug', source: 'web' })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('needs_clarification');
      expect(res.body.questions).toEqual(['Which login page?', 'What browser?']);
      expect(res.body.description).toBe('Fix login bug');
      expect(res.body.createdBy).toBe('integtestuser');

      taskWithQuestions = res.body;
    });

    it('GET /api/tasks - lists the task we just created', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      expect(res.body.tasks).toBeInstanceOf(Array);
      expect(res.body.tasks.length).toBeGreaterThanOrEqual(1);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const found = res.body.tasks.find(
        (t: any) => t.id === taskWithQuestions.id,
      );
      expect(found).toBeDefined();
      expect(found.status).toBe('needs_clarification');
    });

    it('GET /api/tasks/:id - returns the specific task', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskWithQuestions.id}`)
        .expect(200);

      expect(res.body.id).toBe(taskWithQuestions.id);
      expect(res.body.description).toBe('Fix login bug');
      expect(res.body.status).toBe('needs_clarification');
      expect(res.body.clarificationQuestions).toEqual([
        'Which login page?',
        'What browser?',
      ]);
    });

    it('POST /api/tasks/:id/clarify - answers clarification questions and dispatches', async () => {
      // After clarification, LLM returns clear_enough=true
      mockLlmService.analyzeTask.mockResolvedValueOnce({
        summary: 'Fix login bug - clarified',
        task_type: 'bug-fix',
        recommended_agent: 'claude-code',
        likely_files: ['src/auth/login.ts'],
        suggested_acceptance_criteria: ['Login should work'],
        clear_enough: true,
        questions: [],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${taskWithQuestions.id}/clarify`)
        .send({ answers: ['The /auth/login page', 'Chrome 120'] })
        .expect(200);

      expect(res.body.status).toBe('dispatched');
      expect(res.body.issue_number).toBe(42);
      expect(res.body.issue_url).toBe(
        'https://github.com/mothership/test/issues/42',
      );

      // Verify the task is persisted as dispatched
      const taskRes = await request(app.getHttpServer())
        .get(`/api/tasks/${taskWithQuestions.id}`)
        .expect(200);

      expect(taskRes.body.status).toBe('dispatched');
      expect(taskRes.body.isClarified).toBe(true);
      expect(taskRes.body.clarificationAnswers).toEqual([
        'The /auth/login page',
        'Chrome 120',
      ]);
    });

    it('POST /api/tasks - creates a task that dispatches immediately (201)', async () => {
      // Mock LLM to return clear_enough=true
      mockLlmService.analyzeTask.mockResolvedValueOnce({
        summary: 'Add user validation',
        task_type: 'feature',
        recommended_agent: 'codex',
        likely_files: ['src/users/validation.ts'],
        suggested_acceptance_criteria: ['Validation should catch empty fields'],
        clear_enough: true,
        questions: [],
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          description: 'Add user validation to signup form',
          source: 'api',
          repo: 'mothership/web-app',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('dispatched');
      expect(res.body.issue_number).toBe(42);

      taskDispatched = res.body;
    });

    it('DELETE /api/tasks/:id - cancels a non-dispatched task', async () => {
      // Create a task that needs clarification so we can cancel it
      mockLlmService.analyzeTask.mockResolvedValueOnce({
        summary: 'Cancel me',
        task_type: 'bug-fix',
        recommended_agent: 'claude-code',
        likely_files: [],
        suggested_acceptance_criteria: [],
        clear_enough: false,
        questions: ['Some question?'],
      });

      const createRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task to cancel', source: 'web' })
        .expect(201);

      const cancelRes = await request(app.getHttpServer())
        .delete(`/api/tasks/${createRes.body.id}`)
        .expect(200);

      expect(cancelRes.body.message).toBe('Task cancelled successfully');

      // Verify the task is deleted from DB
      await request(app.getHttpServer())
        .get(`/api/tasks/${createRes.body.id}`)
        .expect(404);
    });

    it('POST /api/tasks/:id/retry - retries a failed task', async () => {
      // Create a task that will fail during LLM analysis
      mockLlmService.analyzeTask.mockRejectedValueOnce(
        new Error('LLM API timeout'),
      );

      let failedRes: any;
      try {
        await request(app.getHttpServer())
          .post('/api/tasks')
          .send({ description: 'Task that will fail', source: 'web' });
      } catch {
        // Expected to fail
      }

      // Find the failed task in the DB
      const allTasks = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      const failedTask = allTasks.body.tasks.find(
        (t: any) => t.status === 'failed',
      );

      if (failedTask) {
        // Now retry it with a successful LLM call
        mockLlmService.analyzeTask.mockResolvedValueOnce({
          summary: 'Retried task',
          task_type: 'bug-fix',
          recommended_agent: 'claude-code',
          likely_files: [],
          suggested_acceptance_criteria: [],
          clear_enough: true,
          questions: [],
        });

        const retryRes = await request(app.getHttpServer())
          .post(`/api/tasks/${failedTask.id}/retry`)
          .expect(200);

        expect(retryRes.body.status).toBe('dispatched');
      }
    });

    it('GET /api/tasks?repo=... - filters by repo', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks?repo=mothership/web-app')
        .expect(200);

      expect(res.body.tasks).toBeInstanceOf(Array);
      for (const t of res.body.tasks) {
        expect(t.repo).toBe('mothership/web-app');
      }
    });

    it('GET /api/tasks?status=dispatched - filters by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/tasks?status=dispatched')
        .expect(200);

      expect(res.body.tasks).toBeInstanceOf(Array);
      for (const t of res.body.tasks) {
        expect(t.status).toBe('dispatched');
      }
    });
  });

  // =========================================================================
  //  3. Templates CRUD + Apply
  // =========================================================================

  describe('Templates CRUD + Apply', () => {
    let createdTemplateId: string;

    it('POST /api/templates - creates a template in DB (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates')
        .send({
          name: 'Bug Fix Template',
          description: 'Standard bug fix template',
          descriptionTemplate:
            'Fix the {{issue}} in the {{component}} module',
          variables: {
            issue: {
              label: 'Issue',
              description: 'The bug to fix',
              example: 'login crash',
              required: true,
              type: 'text',
            },
            component: {
              label: 'Component',
              description: 'Affected component',
              example: 'auth',
              required: true,
              type: 'text',
            },
          },
          defaultRepo: 'mothership/finance-service',
          defaultTaskType: 'bug-fix',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Bug Fix Template');
      expect(res.body.descriptionTemplate).toBe(
        'Fix the {{issue}} in the {{component}} module',
      );
      expect(res.body.templateType).toBe('custom');
      expect(res.body.ownerId).toBe('integtestuser');
      expect(res.body.createdBy).toBe('integtestuser');

      createdTemplateId = res.body.id;
    });

    it('GET /api/templates - lists templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/templates')
        .expect(200);

      expect(res.body.templates).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const found = res.body.templates.find(
        (t: any) => t.id === createdTemplateId,
      );
      expect(found).toBeDefined();
      expect(found.name).toBe('Bug Fix Template');
    });

    it('GET /api/templates/:id - returns specific template', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/templates/${createdTemplateId}`)
        .expect(200);

      expect(res.body.id).toBe(createdTemplateId);
      expect(res.body.name).toBe('Bug Fix Template');
    });

    it('PUT /api/templates/:id - updates template', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/templates/${createdTemplateId}`)
        .send({ name: 'Updated Bug Fix Template' })
        .expect(200);

      expect(res.body.name).toBe('Updated Bug Fix Template');

      // Verify persisted
      const getRes = await request(app.getHttpServer())
        .get(`/api/templates/${createdTemplateId}`)
        .expect(200);

      expect(getRes.body.name).toBe('Updated Bug Fix Template');
    });

    it('POST /api/templates/:id/apply - creates task data from template with variable substitution', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/templates/${createdTemplateId}/apply`)
        .send({
          variables: {
            issue: 'null pointer exception',
            component: 'payment',
          },
        })
        .expect(201);

      expect(res.body.description).toBe(
        'Fix the null pointer exception in the payment module',
      );
      expect(res.body.templateId).toBe(createdTemplateId);
      expect(res.body.repo).toBe('mothership/finance-service');
      expect(res.body.taskType).toBe('bug-fix');
    });

    it('POST /api/templates/:id/favorite - increments favoriteCount', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/templates/${createdTemplateId}/favorite`)
        .expect(201);

      expect(res.body.favorited).toBe(true);
      expect(res.body.favoriteCount).toBeGreaterThanOrEqual(1);
    });

    it('DELETE /api/templates/:id - removes template from DB (204)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/templates/${createdTemplateId}`)
        .expect(204);

      // Verify it is gone
      await request(app.getHttpServer())
        .get(`/api/templates/${createdTemplateId}`)
        .expect(404);
    });
  });

  // =========================================================================
  //  4. Dependencies
  // =========================================================================

  describe('Dependencies', () => {
    let taskA: any;
    let taskB: any;
    let dependencyId: string;

    beforeAll(async () => {
      // Create two tasks directly in the DB for dependency tests
      // Task A will depend on Task B
      mockLlmService.analyzeTask.mockResolvedValue({
        summary: 'Dep test task',
        task_type: 'feature',
        recommended_agent: 'claude-code',
        likely_files: [],
        suggested_acceptance_criteria: [],
        clear_enough: false,
        questions: ['Which feature?'],
      });

      const resA = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task A - depends on B', source: 'web' });
      taskA = resA.body;

      const resB = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task B - blocking task', source: 'web' });
      taskB = resB.body;
    });

    it('POST /api/tasks/:taskId/dependencies - adds a task dependency (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${taskA.id}/dependencies`)
        .send({
          type: 'task',
          taskId: taskB.id,
          blockingBehavior: 'hard',
        })
        .expect(201);

      expect(res.body.id).toBe(taskA.id);
      expect(res.body.dependencyStatus).toBe('pending');
      expect(res.body.dependencies).toBeInstanceOf(Array);
      expect(res.body.dependencies.length).toBe(1);
      expect(res.body.dependencies[0].type).toBe('task');
      expect(res.body.dependencies[0].taskId).toBe(taskB.id);

      dependencyId = res.body.dependencies[0].id;
    });

    it('GET /api/tasks/:taskId/dependencies - returns enriched dependencies', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskA.id}/dependencies`)
        .expect(200);

      expect(res.body.taskId).toBe(taskA.id);
      expect(res.body.dependencies).toBeInstanceOf(Array);
      expect(res.body.dependencies.length).toBe(1);
      expect(res.body.dependencies[0].type).toBe('task');
      expect(res.body.dependencies[0].taskId).toBe(taskB.id);
      expect(res.body.dependencies[0].taskStatus).toBe('needs_clarification');
      expect(res.body.canStart).toBe(false);
    });

    it('GET /api/tasks/:otherTaskId/dependencies/dependents - returns dependent tasks', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${taskB.id}/dependencies/dependents`)
        .expect(200);

      expect(res.body.taskId).toBe(taskB.id);
      expect(res.body.dependents).toBeInstanceOf(Array);
      expect(res.body.dependents.length).toBeGreaterThanOrEqual(1);

      const dependent = res.body.dependents.find(
        (d: any) => d.id === taskA.id,
      );
      expect(dependent).toBeDefined();
    });

    it('DELETE /api/tasks/:taskId/dependencies/:depId - removes dependency (200)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/tasks/${taskA.id}/dependencies/${dependencyId}`)
        .expect(200);

      expect(res.body.id).toBe(taskA.id);
      expect(res.body.dependencies).toBeInstanceOf(Array);
      expect(res.body.dependencies.length).toBe(0);

      // Verify removal persisted
      const depRes = await request(app.getHttpServer())
        .get(`/api/tasks/${taskA.id}/dependencies`)
        .expect(200);

      expect(depRes.body.dependencies.length).toBe(0);
      expect(depRes.body.canStart).toBe(true);
    });
  });

  // =========================================================================
  //  5. Stats (with real data)
  // =========================================================================

  describe('Stats (with real data)', () => {
    it('GET /api/stats/overview - returns real metrics from DB', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/overview?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('period');
      expect(res.body).toHaveProperty('volume');
      expect(res.body).toHaveProperty('quality');
      expect(res.body).toHaveProperty('performance');
      expect(res.body).toHaveProperty('breakdown');

      // We created several tasks in earlier tests
      expect(res.body.volume.tasksCreated).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/stats/by-status - returns status breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/by-status?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('byStatus');
      expect(res.body).toHaveProperty('period');

      // Dispatched tasks should exist from earlier tests
      expect(typeof res.body.byStatus).toBe('object');
    });

    it('GET /api/stats/by-repo - returns repo breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/stats/by-repo?timeRange=alltime')
        .expect(200);

      expect(res.body).toHaveProperty('byRepo');
      expect(res.body).toHaveProperty('period');

      expect(typeof res.body.byRepo).toBe('object');
    });
  });

  // =========================================================================
  //  6. Reminders
  // =========================================================================

  describe('Reminders', () => {
    let taskForReminder: any;
    let reminderId: string;

    beforeAll(async () => {
      // Create a task to attach the reminder to
      mockLlmService.analyzeTask.mockResolvedValueOnce({
        summary: 'Reminder test task',
        task_type: 'feature',
        recommended_agent: 'claude-code',
        likely_files: [],
        suggested_acceptance_criteria: [],
        clear_enough: false,
        questions: ['Details?'],
      });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Task for reminder testing', source: 'web' });

      taskForReminder = res.body;
    });

    it('POST /api/reminders - creates a custom reminder (201)', async () => {
      const scheduledFor = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const res = await request(app.getHttpServer())
        .post('/api/reminders')
        .send({
          taskId: taskForReminder.id,
          title: 'Check task progress',
          description: 'Make sure task is moving forward',
          scheduledFor,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.taskId).toBe(taskForReminder.id);
      expect(res.body.type).toBe('custom');
      expect(res.body.title).toBe('Check task progress');
      expect(res.body.status).toBe('pending');

      reminderId = res.body.id;
    });

    it('GET /api/reminders - lists reminders for the user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reminders')
        .expect(200);

      expect(res.body.reminders).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThanOrEqual(1);

      const found = res.body.reminders.find(
        (r: any) => r.id === reminderId,
      );
      expect(found).toBeDefined();
    });

    it('POST /api/reminders/:id/snooze - snoozes reminder', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/snooze`)
        .send({ durationHours: 2 })
        .expect(201);

      expect(res.body.id).toBe(reminderId);
      expect(res.body.status).toBe('snoozed');
      expect(res.body.snoozeUntil).toBeDefined();
      expect(res.body.message).toContain('snoozed until');
    });

    it('POST /api/reminders/:id/dismiss - dismisses reminder', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/dismiss`)
        .send({ reason: 'No longer relevant' })
        .expect(201);

      expect(res.body.id).toBe(reminderId);
      expect(res.body.status).toBe('dismissed');
      expect(res.body.dismissedAt).toBeDefined();
    });

    it('POST /api/reminders/:id/undo-dismiss - undoes dismissal', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/reminders/${reminderId}/undo-dismiss`)
        .expect(201);

      expect(res.body.id).toBe(reminderId);
      expect(res.body.status).toBe('pending');
    });
  });

  // =========================================================================
  //  7. Notifications
  // =========================================================================

  describe('Notifications', () => {
    it('GET /api/notifications/preferences - returns or creates default preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/preferences')
        .expect(200);

      // NotificationsController does not use AuthGuard (it is commented out),
      // so req.user is undefined and it falls back to 'test-user'
      expect(res.body).toHaveProperty('userId', 'test-user');
      expect(res.body).toHaveProperty('channels');
      expect(res.body.channels).toHaveProperty('email');
      expect(res.body.channels.email.enabled).toBe(true);
      expect(res.body).toHaveProperty('eventPreferences');
      expect(res.body).toHaveProperty('quietHours');
      expect(res.body).toHaveProperty('unsubscribeToken');
    });

    it('PATCH /api/notifications/preferences - updates preferences', async () => {
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

    it('POST /api/notifications/preferences/reset - resets to defaults', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notifications/preferences/reset')
        .expect(201);

      expect(res.body.channels.email.enabled).toBe(true);
      expect(res.body.channels.slack_dm.enabled).toBe(true);
      expect(res.body.channels.slack_channel.enabled).toBe(false);
      expect(res.body.quietHours.enabled).toBe(false);
    });
  });
});
