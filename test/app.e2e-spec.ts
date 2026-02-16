// Mock ESM-only packages BEFORE any imports that trigger the dependency chain.
// @octokit/rest (used by repos.service.ts) ships ESM which Jest cannot parse
// without extensive transformIgnorePatterns. Mocking it avoids that entirely.
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    repos: { listForOrg: jest.fn() },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
  HttpStatus,
} from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

// Service class imports (used as DI tokens)
import { TasksService } from '../src/tasks/tasks.service';
import { TemplatesService } from '../src/templates/templates.service';
import { StatsService } from '../src/stats/stats.service';
import { ReposService } from '../src/repos/repos.service';
import { DependenciesService } from '../src/dependencies/dependencies.service';
import { RemindersService } from '../src/reminders/reminders.service';
import { NotificationsService } from '../src/notifications/notifications.service';

// Controller imports
import { HealthController } from '../src/tasks/health.controller';
import { TasksController } from '../src/tasks/tasks.controller';
import { TemplatesController } from '../src/templates/templates.controller';
import { StatsController } from '../src/stats/stats.controller';
import { ReposController } from '../src/repos/repos.controller';
import { DependenciesController } from '../src/dependencies/dependencies.controller';
import { RemindersController } from '../src/reminders/reminders.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';

// Guard imports
import { AuthGuard } from '../src/auth/auth.guard';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';

// ---------------------------------------------------------------------------
// Mock Auth Guard helpers
// ---------------------------------------------------------------------------

const mockUser = {
  id: 'user-123',
  githubId: '12345',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: 'https://github.com/testuser.png',
  role: 'admin',
  status: 'active',
  accessToken: 'ghp_test',
};

/**
 * Guard that always allows access and attaches a mock user to the request.
 */
class MockAuthGuardAllow implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { ...mockUser };
    req.isAuthenticated = () => true;
    return true;
  }
}

/**
 * Guard that always denies access (simulates unauthenticated request).
 */
class MockAuthGuardDeny implements CanActivate {
  canActivate(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp(
  moduleRef: TestingModule,
): Promise<INestApplication<App>> {
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  return app.init() as Promise<INestApplication<App>>;
}

// =========================================================================
//  1. HealthController
// =========================================================================

describe('HealthController (e2e)', () => {
  let app: INestApplication<App>;

  const mockTasksService = {
    getHealth: jest.fn().mockResolvedValue({ status: 'ok', db: 'connected' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    }).compile();

    app = await createApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health - returns 200 with health status', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toEqual({ status: 'ok', db: 'connected' });
      });
  });

  it('GET /api/health - no auth required', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(HttpStatus.OK);
  });
});

// =========================================================================
//  2. TasksController
// =========================================================================

describe('TasksController (e2e)', () => {
  let app: INestApplication<App>;

  const mockTask = {
    _id: 'task-abc-123',
    description: 'Fix the login bug',
    type: 'bug-fix',
    repo: 'mothership/api',
    status: 'received',
    createdBy: 'testuser',
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  const mockTasksServiceImpl = {
    create: jest.fn().mockResolvedValue(mockTask),
    findAll: jest.fn().mockResolvedValue({ tasks: [mockTask], total: 1 }),
    findOne: jest.fn().mockResolvedValue(mockTask),
    clarify: jest.fn().mockResolvedValue({ ...mockTask, status: 'analyzing' }),
    retry: jest.fn().mockResolvedValue({ ...mockTask, status: 'received' }),
    cancel: jest.fn().mockResolvedValue({ ...mockTask, status: 'failed' }),
  };

  describe('authenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [TasksController],
        providers: [
          { provide: TasksService, useValue: mockTasksServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardAllow)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // -- POST /api/tasks --
    it('POST /api/tasks - creates a task (201)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Fix the login bug', type: 'bug-fix', repo: 'mothership/api' })
        .expect(HttpStatus.CREATED)
        .expect((res) => {
          expect(mockTasksServiceImpl.create).toHaveBeenCalledWith(
            expect.objectContaining({
              description: 'Fix the login bug',
              createdBy: 'testuser',
            }),
          );
          expect(res.body).toEqual(mockTask);
        });
    });

    it('POST /api/tasks - validation fails without description (400)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .send({ type: 'bug-fix' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('POST /api/tasks - validation fails with invalid type (400)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'A task', type: 'invalid-type' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('POST /api/tasks - validation fails with invalid priority (400)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'A task', priority: 'critical' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    // -- GET /api/tasks --
    it('GET /api/tasks - returns task list (200)', () => {
      return request(app.getHttpServer())
        .get('/api/tasks')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTasksServiceImpl.findAll).toHaveBeenCalled();
        });
    });

    it('GET /api/tasks?status=received - accepts query params', () => {
      return request(app.getHttpServer())
        .get('/api/tasks?status=received&page=1&limit=10')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTasksServiceImpl.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
              status: 'received',
              page: 1,
              limit: 10,
            }),
          );
        });
    });

    // -- GET /api/tasks/:id --
    it('GET /api/tasks/:id - returns single task (200)', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/task-abc-123')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(mockTasksServiceImpl.findOne).toHaveBeenCalledWith('task-abc-123');
          expect(res.body).toEqual(mockTask);
        });
    });

    // -- POST /api/tasks/:id/clarify --
    it('POST /api/tasks/:id/clarify - clarifies a task (200)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks/task-abc-123/clarify')
        .send({ answers: ['The login page at /auth/login'] })
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTasksServiceImpl.clarify).toHaveBeenCalledWith(
            'task-abc-123',
            expect.objectContaining({ answers: ['The login page at /auth/login'] }),
          );
        });
    });

    it('POST /api/tasks/:id/clarify - validation fails without answers (400)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks/task-abc-123/clarify')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('POST /api/tasks/:id/clarify - validation fails with empty answers (400)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks/task-abc-123/clarify')
        .send({ answers: [] })
        .expect(HttpStatus.BAD_REQUEST);
    });

    // -- POST /api/tasks/:id/retry --
    it('POST /api/tasks/:id/retry - retries a task (200)', () => {
      return request(app.getHttpServer())
        .post('/api/tasks/task-abc-123/retry')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTasksServiceImpl.retry).toHaveBeenCalledWith('task-abc-123');
        });
    });

    // -- DELETE /api/tasks/:id --
    it('DELETE /api/tasks/:id - cancels a task (200)', () => {
      return request(app.getHttpServer())
        .delete('/api/tasks/task-abc-123')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTasksServiceImpl.cancel).toHaveBeenCalledWith('task-abc-123');
        });
    });
  });

  describe('unauthenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [TasksController],
        providers: [
          { provide: TasksService, useValue: mockTasksServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardDeny)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    it('POST /api/tasks - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .send({ description: 'Fix bug' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('GET /api/tasks - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/tasks')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('GET /api/tasks/:id - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/task-abc-123')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('DELETE /api/tasks/:id - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .delete('/api/tasks/task-abc-123')
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});

// =========================================================================
//  3. TemplatesController
// =========================================================================

describe('TemplatesController (e2e)', () => {
  let app: INestApplication<App>;

  const mockTemplate = {
    _id: 'tpl-123',
    name: 'Bug Fix Template',
    description: 'Template for bug fixes',
    descriptionTemplate: 'Fix the {{issue}} in {{component}}',
    variables: { issue: { type: 'string', required: true }, component: { type: 'string', required: true } },
    templateType: 'custom',
    ownerId: 'testuser',
  };

  const mockTemplatesServiceImpl = {
    findAll: jest.fn().mockResolvedValue({ templates: [mockTemplate], total: 1 }),
    findOne: jest.fn().mockResolvedValue(mockTemplate),
    create: jest.fn().mockResolvedValue(mockTemplate),
    update: jest.fn().mockResolvedValue({ ...mockTemplate, name: 'Updated Template' }),
    remove: jest.fn().mockResolvedValue(undefined),
    apply: jest.fn().mockResolvedValue({ description: 'Fix the crash in auth', files: [] }),
    favorite: jest.fn().mockResolvedValue({ ...mockTemplate, isFavorited: true }),
    unfavorite: jest.fn().mockResolvedValue({ ...mockTemplate, isFavorited: false }),
  };

  describe('authenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [TemplatesController],
        providers: [
          { provide: TemplatesService, useValue: mockTemplatesServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardAllow)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // -- GET /api/templates --
    it('GET /api/templates - returns templates list (200)', () => {
      return request(app.getHttpServer())
        .get('/api/templates')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTemplatesServiceImpl.findAll).toHaveBeenCalled();
        });
    });

    // -- GET /api/templates/:id --
    it('GET /api/templates/:id - returns single template (200)', () => {
      return request(app.getHttpServer())
        .get('/api/templates/tpl-123')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(mockTemplatesServiceImpl.findOne).toHaveBeenCalledWith('tpl-123', 'testuser');
          expect(res.body).toEqual(mockTemplate);
        });
    });

    // -- POST /api/templates --
    it('POST /api/templates - creates a template (201)', () => {
      return request(app.getHttpServer())
        .post('/api/templates')
        .send({
          name: 'Bug Fix Template',
          description: 'Template for bug fixes',
          descriptionTemplate: 'Fix the {{issue}}',
          variables: { issue: { type: 'string', required: true } },
        })
        .expect(HttpStatus.CREATED)
        .expect(() => {
          expect(mockTemplatesServiceImpl.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Bug Fix Template' }),
            'testuser',
          );
        });
    });

    it('POST /api/templates - validation fails without name (400)', () => {
      return request(app.getHttpServer())
        .post('/api/templates')
        .send({
          description: 'Template for bug fixes',
          descriptionTemplate: 'Fix the {{issue}}',
          variables: { issue: { type: 'string' } },
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('POST /api/templates - validation fails without variables (400)', () => {
      return request(app.getHttpServer())
        .post('/api/templates')
        .send({
          name: 'Bug Fix Template',
          description: 'A desc',
          descriptionTemplate: 'Fix the {{issue}}',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });

    // -- PUT /api/templates/:id --
    it('PUT /api/templates/:id - updates a template (200)', () => {
      return request(app.getHttpServer())
        .put('/api/templates/tpl-123')
        .send({ name: 'Updated Template' })
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTemplatesServiceImpl.update).toHaveBeenCalledWith(
            'tpl-123',
            expect.objectContaining({ name: 'Updated Template' }),
            'testuser',
            true, // isAdmin
          );
        });
    });

    // -- DELETE /api/templates/:id --
    it('DELETE /api/templates/:id - removes a template (204)', () => {
      return request(app.getHttpServer())
        .delete('/api/templates/tpl-123')
        .expect(HttpStatus.NO_CONTENT)
        .expect(() => {
          expect(mockTemplatesServiceImpl.remove).toHaveBeenCalledWith(
            'tpl-123',
            'testuser',
            true,
          );
        });
    });

    // -- POST /api/templates/:id/apply --
    it('POST /api/templates/:id/apply - applies a template (201)', () => {
      return request(app.getHttpServer())
        .post('/api/templates/tpl-123/apply')
        .send({ variables: { issue: 'crash', component: 'auth' } })
        .expect(HttpStatus.CREATED)
        .expect(() => {
          expect(mockTemplatesServiceImpl.apply).toHaveBeenCalledWith(
            'tpl-123',
            expect.objectContaining({ variables: { issue: 'crash', component: 'auth' } }),
          );
        });
    });

    it('POST /api/templates/:id/apply - validation fails without variables (400)', () => {
      return request(app.getHttpServer())
        .post('/api/templates/tpl-123/apply')
        .send({})
        .expect(HttpStatus.BAD_REQUEST);
    });

    // -- POST /api/templates/:id/favorite --
    it('POST /api/templates/:id/favorite - favorites a template (201)', () => {
      return request(app.getHttpServer())
        .post('/api/templates/tpl-123/favorite')
        .expect(HttpStatus.CREATED)
        .expect(() => {
          expect(mockTemplatesServiceImpl.favorite).toHaveBeenCalledWith('tpl-123', 'testuser');
        });
    });

    // -- DELETE /api/templates/:id/favorite --
    it('DELETE /api/templates/:id/favorite - unfavorites a template (200)', () => {
      return request(app.getHttpServer())
        .delete('/api/templates/tpl-123/favorite')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockTemplatesServiceImpl.unfavorite).toHaveBeenCalledWith('tpl-123', 'testuser');
        });
    });
  });

  describe('unauthenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [TemplatesController],
        providers: [
          { provide: TemplatesService, useValue: mockTemplatesServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardDeny)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/templates - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/templates')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('POST /api/templates - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .post('/api/templates')
        .send({
          name: 'Test',
          description: 'desc',
          descriptionTemplate: 'tmpl',
          variables: {},
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('DELETE /api/templates/:id - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .delete('/api/templates/tpl-123')
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});

// =========================================================================
//  4. StatsController
// =========================================================================

describe('StatsController (e2e)', () => {
  let app: INestApplication<App>;

  const mockMetrics = {
    totalTasks: 42,
    breakdown: {
      byStatus: { received: 10, coding: 15, merged: 17 },
      byRepo: { 'mothership/api': 20, 'mothership/web': 22 },
    },
    period: { from: '2024-01-01', to: '2024-01-07' },
  };

  const mockDailyVolume = [
    { date: '2024-01-01', count: 5 },
    { date: '2024-01-02', count: 8 },
  ];

  const mockUserActivity = {
    users: [{ username: 'testuser', taskCount: 10 }],
    total: 1,
  };

  const mockAgentPerformance = {
    agents: [{ name: 'claude', successRate: 0.95 }],
  };

  const mockFailures = {
    failures: [{ taskId: 'task-1', error: 'timeout' }],
    total: 1,
  };

  const mockStatsServiceImpl = {
    getMetrics: jest.fn().mockResolvedValue(mockMetrics),
    getDailyVolume: jest.fn().mockResolvedValue(mockDailyVolume),
    getUserActivity: jest.fn().mockResolvedValue(mockUserActivity),
    getAgentPerformance: jest.fn().mockResolvedValue(mockAgentPerformance),
    getFailures: jest.fn().mockResolvedValue(mockFailures),
  };

  describe('authenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [StatsController],
        providers: [
          { provide: StatsService, useValue: mockStatsServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardAllow)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // -- GET /api/stats/overview --
    it('GET /api/stats/overview - returns metrics (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/overview')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toEqual(mockMetrics);
          expect(mockStatsServiceImpl.getMetrics).toHaveBeenCalled();
        });
    });

    // -- GET /api/stats/by-status --
    it('GET /api/stats/by-status - returns status breakdown (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/by-status')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('byStatus');
          expect(res.body).toHaveProperty('period');
        });
    });

    // -- GET /api/stats/by-repo --
    it('GET /api/stats/by-repo - returns repo breakdown (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/by-repo')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('byRepo');
          expect(res.body).toHaveProperty('period');
        });
    });

    // -- GET /api/stats/trends --
    it('GET /api/stats/trends - returns daily volume (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/trends')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toEqual(mockDailyVolume);
          expect(mockStatsServiceImpl.getDailyVolume).toHaveBeenCalled();
        });
    });

    // -- GET /api/stats/by-user --
    it('GET /api/stats/by-user - returns user activity (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/by-user')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toEqual(mockUserActivity);
          expect(mockStatsServiceImpl.getUserActivity).toHaveBeenCalled();
        });
    });

    it('GET /api/stats/by-user?page=2&limit=5 - passes pagination params', () => {
      return request(app.getHttpServer())
        .get('/api/stats/by-user?page=2&limit=5')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockStatsServiceImpl.getUserActivity).toHaveBeenCalledWith(
            expect.anything(),
            2,
            5,
          );
        });
    });

    // -- GET /api/stats/agent-performance --
    it('GET /api/stats/agent-performance - returns agent stats (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/agent-performance')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toEqual(mockAgentPerformance);
        });
    });

    // -- GET /api/stats/failures --
    it('GET /api/stats/failures - returns failures list (200)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/failures')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toEqual(mockFailures);
        });
    });

    it('GET /api/stats/failures?page=1&limit=5 - passes pagination', () => {
      return request(app.getHttpServer())
        .get('/api/stats/failures?page=1&limit=5')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockStatsServiceImpl.getFailures).toHaveBeenCalledWith(
            expect.anything(),
            1,
            5,
          );
        });
    });

    // -- query param validation --
    it('GET /api/stats/overview?timeRange=7d - accepts valid time range', () => {
      return request(app.getHttpServer())
        .get('/api/stats/overview?timeRange=7d')
        .expect(HttpStatus.OK);
    });

    it('GET /api/stats/overview?timeRange=invalid - rejects invalid time range (400)', () => {
      return request(app.getHttpServer())
        .get('/api/stats/overview?timeRange=invalid')
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('unauthenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [StatsController],
        providers: [
          { provide: StatsService, useValue: mockStatsServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardDeny)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/stats/overview - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/stats/overview')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('GET /api/stats/trends - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/stats/trends')
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});

// =========================================================================
//  5. ReposController
// =========================================================================

describe('ReposController (e2e)', () => {
  let app: INestApplication<App>;

  const mockRepo = {
    _id: { toString: () => 'repo-123' },
    repoName: 'mothership/api',
    defaultAgent: 'claude',
    customSystemPrompt: null,
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  const mockReposServiceImpl = {
    getUserRepos: jest.fn().mockResolvedValue([mockRepo]),
    getAvailableRepos: jest.fn().mockResolvedValue([]),
    addRepo: jest.fn().mockResolvedValue(mockRepo),
    removeRepo: jest.fn().mockResolvedValue(undefined),
    getRepoById: jest.fn().mockResolvedValue(mockRepo),
    getRepoStats: jest.fn().mockResolvedValue({
      totalTasks: 10,
      statusBreakdown: { received: 5, merged: 5 },
    }),
    updateRepoSettings: jest.fn().mockResolvedValue(mockRepo),
  };

  describe('authenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ReposController],
        providers: [
          { provide: ReposService, useValue: mockReposServiceImpl },
        ],
      })
        .overrideGuard(PassportAuthGuard('session'))
        .useClass(MockAuthGuardAllow)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // -- GET /api/repos --
    it('GET /api/repos - returns user repos (200)', () => {
      return request(app.getHttpServer())
        .get('/api/repos')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('repos');
          expect(res.body).toHaveProperty('total');
          expect(mockReposServiceImpl.getUserRepos).toHaveBeenCalledWith('testuser', false);
        });
    });

    it('GET /api/repos?includeStats=true - includes stats', () => {
      return request(app.getHttpServer())
        .get('/api/repos?includeStats=true')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockReposServiceImpl.getUserRepos).toHaveBeenCalledWith('testuser', true);
        });
    });

    // -- GET /api/repos/available --
    it('GET /api/repos/available - returns available repos (200)', () => {
      return request(app.getHttpServer())
        .get('/api/repos/available')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('repos');
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('cached', true);
          expect(res.body).toHaveProperty('cacheExpiresAt');
        });
    });

    // -- POST /api/repos --
    it('POST /api/repos - adds a repo (201)', () => {
      return request(app.getHttpServer())
        .post('/api/repos')
        .send({ repoName: 'mothership/api', defaultAgent: 'claude' })
        .expect(HttpStatus.CREATED)
        .expect(() => {
          expect(mockReposServiceImpl.addRepo).toHaveBeenCalledWith(
            'testuser',
            'mothership/api',
            'claude',
          );
        });
    });

    it('POST /api/repos - validation fails without repoName (400)', () => {
      return request(app.getHttpServer())
        .post('/api/repos')
        .send({ defaultAgent: 'claude' })
        .expect(HttpStatus.BAD_REQUEST);
    });

    // -- DELETE /api/repos/:id --
    it('DELETE /api/repos/:id - removes a repo (200)', () => {
      return request(app.getHttpServer())
        .delete('/api/repos/repo-123')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('repoName');
          expect(res.body).toHaveProperty('tasksKept');
          expect(mockReposServiceImpl.removeRepo).toHaveBeenCalledWith('testuser', 'repo-123');
        });
    });

    // -- GET /api/repos/:id/stats --
    it('GET /api/repos/:id/stats - returns repo stats (200)', () => {
      return request(app.getHttpServer())
        .get('/api/repos/repo-123/stats')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('repoName');
          expect(res.body).toHaveProperty('period', '7d');
          expect(res.body).toHaveProperty('totalTasks');
        });
    });

    // -- GET /api/repos/:id/settings --
    it('GET /api/repos/:id/settings - returns repo settings (200)', () => {
      return request(app.getHttpServer())
        .get('/api/repos/repo-123/settings')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('repoName');
          expect(res.body).toHaveProperty('defaultAgent');
        });
    });

    // -- PATCH /api/repos/:id/settings --
    it('PATCH /api/repos/:id/settings - updates settings (200)', () => {
      return request(app.getHttpServer())
        .patch('/api/repos/repo-123/settings')
        .send({ defaultAgent: 'cursor' })
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockReposServiceImpl.updateRepoSettings).toHaveBeenCalledWith(
            'testuser',
            'repo-123',
            expect.objectContaining({ defaultAgent: 'cursor' }),
          );
        });
    });
  });

  describe('unauthenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [ReposController],
        providers: [
          { provide: ReposService, useValue: mockReposServiceImpl },
        ],
      })
        .overrideGuard(PassportAuthGuard('session'))
        .useClass(MockAuthGuardDeny)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/repos - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/repos')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('POST /api/repos - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .post('/api/repos')
        .send({ repoName: 'mothership/api' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('DELETE /api/repos/:id - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .delete('/api/repos/repo-123')
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});

// =========================================================================
//  6. DependenciesController
// =========================================================================

describe('DependenciesController (e2e)', () => {
  let app: INestApplication<App>;

  const mockTaskWithDeps = {
    _id: { toString: () => 'task-123' },
    status: 'received',
    dependencyStatus: 'pending',
    dependencies: [
      { type: 'task', taskId: 'task-456', status: 'pending' },
    ],
  };

  const mockDependencies = [
    { type: 'task', taskId: 'task-456', status: 'pending' },
  ];

  const mockDependents = [
    {
      _id: { toString: () => 'task-789' },
      llmSummary: 'Dependent task summary',
      description: 'A dependent task',
      status: 'received',
      dependencyStatus: 'blocked',
    },
  ];

  const mockDependenciesServiceImpl = {
    addDependency: jest.fn().mockResolvedValue(mockTaskWithDeps),
    removeDependency: jest.fn().mockResolvedValue({
      _id: { toString: () => 'task-123' },
      dependencies: [],
    }),
    getDependencies: jest.fn().mockResolvedValue(mockDependencies),
    getDependents: jest.fn().mockResolvedValue(mockDependents),
  };

  // DependenciesController has no auth guard
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DependenciesController],
      providers: [
        { provide: DependenciesService, useValue: mockDependenciesServiceImpl },
      ],
    }).compile();

    app = await createApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- POST /api/tasks/:taskId/dependencies --
  it('POST /api/tasks/:taskId/dependencies - adds dependency (201)', () => {
    return request(app.getHttpServer())
      .post('/api/tasks/task-123/dependencies')
      .send({ type: 'task', taskId: 'task-456' })
      .expect(HttpStatus.CREATED)
      .expect((res) => {
        expect(res.body).toHaveProperty('id', 'task-123');
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('dependencyStatus');
        expect(res.body).toHaveProperty('dependencies');
        expect(mockDependenciesServiceImpl.addDependency).toHaveBeenCalledWith(
          'task-123',
          expect.objectContaining({ type: 'task', taskId: 'task-456' }),
        );
      });
  });

  it('POST /api/tasks/:taskId/dependencies - validation fails without type (400)', () => {
    return request(app.getHttpServer())
      .post('/api/tasks/task-123/dependencies')
      .send({ taskId: 'task-456' })
      .expect(HttpStatus.BAD_REQUEST);
  });

  it('POST /api/tasks/:taskId/dependencies - validation fails with invalid type (400)', () => {
    return request(app.getHttpServer())
      .post('/api/tasks/task-123/dependencies')
      .send({ type: 'invalid' })
      .expect(HttpStatus.BAD_REQUEST);
  });

  // -- DELETE /api/tasks/:taskId/dependencies/:dependencyId --
  it('DELETE /api/tasks/:taskId/dependencies/:depId - removes dependency (200)', () => {
    return request(app.getHttpServer())
      .delete('/api/tasks/task-123/dependencies/dep-456')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toHaveProperty('id', 'task-123');
        expect(res.body).toHaveProperty('dependencies');
        expect(mockDependenciesServiceImpl.removeDependency).toHaveBeenCalledWith(
          'task-123',
          'dep-456',
        );
      });
  });

  // -- GET /api/tasks/:taskId/dependencies --
  it('GET /api/tasks/:taskId/dependencies - returns dependencies (200)', () => {
    return request(app.getHttpServer())
      .get('/api/tasks/task-123/dependencies')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toEqual(mockDependencies);
        expect(mockDependenciesServiceImpl.getDependencies).toHaveBeenCalledWith('task-123');
      });
  });

  // -- GET /api/tasks/:taskId/dependencies/dependents --
  it('GET /api/tasks/:taskId/dependencies/dependents - returns dependents (200)', () => {
    return request(app.getHttpServer())
      .get('/api/tasks/task-123/dependencies/dependents')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toHaveProperty('taskId', 'task-123');
        expect(res.body).toHaveProperty('dependents');
        expect(res.body.dependents).toHaveLength(1);
        expect(res.body.dependents[0]).toHaveProperty('id', 'task-789');
        expect(res.body.dependents[0]).toHaveProperty('title');
        expect(res.body.dependents[0]).toHaveProperty('status');
      });
  });
});

// =========================================================================
//  7. RemindersController
// =========================================================================

describe('RemindersController (e2e)', () => {
  let app: INestApplication<App>;

  const mockReminder = {
    _id: { toString: () => 'rem-123' },
    userId: 'testuser',
    taskId: 'task-123',
    type: 'custom',
    title: 'Check task progress',
    status: 'active',
    scheduledFor: new Date('2024-01-15T09:00:00.000Z'),
    snoozeUntil: null,
    dismissedAt: null,
  };

  const mockRemindersServiceImpl = {
    getReminders: jest.fn().mockResolvedValue({
      reminders: [mockReminder],
      total: 1,
    }),
    getReminderSummary: jest.fn().mockResolvedValue({
      active: 3,
      snoozed: 1,
      dismissed: 5,
    }),
    getOrCreatePreferences: jest.fn().mockResolvedValue({
      enabled: true,
      channels: ['email'],
    }),
    updatePreferences: jest.fn().mockResolvedValue({
      enabled: true,
      channels: ['email', 'slack'],
    }),
    snoozeReminder: jest.fn().mockResolvedValue({
      ...mockReminder,
      status: 'snoozed',
      snoozeUntil: new Date('2024-01-16T09:00:00.000Z'),
    }),
    dismissReminder: jest.fn().mockResolvedValue({
      ...mockReminder,
      status: 'dismissed',
      dismissedAt: new Date('2024-01-15T10:00:00.000Z'),
    }),
    undoDismiss: jest.fn().mockResolvedValue({
      ...mockReminder,
      status: 'active',
      dismissedAt: null,
    }),
    deleteReminder: jest.fn().mockResolvedValue(undefined),
    createReminder: jest.fn().mockResolvedValue(mockReminder),
  };

  describe('authenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [RemindersController],
        providers: [
          { provide: RemindersService, useValue: mockRemindersServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardAllow)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    // -- GET /api/reminders --
    it('GET /api/reminders - returns reminders list (200)', () => {
      return request(app.getHttpServer())
        .get('/api/reminders')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('reminders');
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('page');
          expect(res.body).toHaveProperty('limit');
          expect(mockRemindersServiceImpl.getReminders).toHaveBeenCalledWith(
            'testuser',
            expect.any(Object),
          );
        });
    });

    it('GET /api/reminders?status=active&page=2&limit=10 - passes query params', () => {
      return request(app.getHttpServer())
        .get('/api/reminders?status=active&page=2&limit=10')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockRemindersServiceImpl.getReminders).toHaveBeenCalledWith(
            'testuser',
            expect.objectContaining({
              status: 'active',
              page: 2,
              limit: 10,
            }),
          );
        });
    });

    // -- GET /api/reminders/summary --
    it('GET /api/reminders/summary - returns summary (200)', () => {
      return request(app.getHttpServer())
        .get('/api/reminders/summary')
        .expect(HttpStatus.OK)
        .expect((res) => {
          expect(res.body).toHaveProperty('active');
          expect(res.body).toHaveProperty('snoozed');
          expect(res.body).toHaveProperty('dismissed');
        });
    });

    // -- GET /api/reminders/preferences --
    it('GET /api/reminders/preferences - returns preferences (200)', () => {
      return request(app.getHttpServer())
        .get('/api/reminders/preferences')
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockRemindersServiceImpl.getOrCreatePreferences).toHaveBeenCalledWith('testuser');
        });
    });

    // -- PATCH /api/reminders/preferences --
    it('PATCH /api/reminders/preferences - updates preferences (200)', () => {
      return request(app.getHttpServer())
        .patch('/api/reminders/preferences')
        .send({ enabled: true, channels: ['email', 'slack'] })
        .expect(HttpStatus.OK)
        .expect(() => {
          expect(mockRemindersServiceImpl.updatePreferences).toHaveBeenCalledWith(
            'testuser',
            expect.objectContaining({ enabled: true }),
          );
        });
    });

    // -- POST /api/reminders/:id/snooze --
    it('POST /api/reminders/:id/snooze - snoozes a reminder (201)', () => {
      return request(app.getHttpServer())
        .post('/api/reminders/rem-123/snooze')
        .send({ durationHours: 24 })
        .expect(HttpStatus.CREATED)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('status', 'snoozed');
          expect(res.body).toHaveProperty('snoozeUntil');
          expect(res.body).toHaveProperty('message');
        });
    });

    // -- POST /api/reminders/:id/dismiss --
    it('POST /api/reminders/:id/dismiss - dismisses a reminder (201)', () => {
      return request(app.getHttpServer())
        .post('/api/reminders/rem-123/dismiss')
        .send({ reason: 'No longer relevant' })
        .expect(HttpStatus.CREATED)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('status', 'dismissed');
          expect(res.body).toHaveProperty('dismissedAt');
        });
    });

    // -- POST /api/reminders/:id/undo-dismiss --
    it('POST /api/reminders/:id/undo-dismiss - undoes dismiss (201)', () => {
      return request(app.getHttpServer())
        .post('/api/reminders/rem-123/undo-dismiss')
        .expect(HttpStatus.CREATED)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('status', 'active');
        });
    });

    // -- DELETE /api/reminders/:id --
    it('DELETE /api/reminders/:id - deletes a reminder (204)', () => {
      return request(app.getHttpServer())
        .delete('/api/reminders/rem-123')
        .expect(HttpStatus.NO_CONTENT)
        .expect(() => {
          expect(mockRemindersServiceImpl.deleteReminder).toHaveBeenCalledWith('rem-123');
        });
    });

    // -- POST /api/reminders --
    it('POST /api/reminders - creates a custom reminder (201)', () => {
      return request(app.getHttpServer())
        .post('/api/reminders')
        .send({
          taskId: 'task-123',
          title: 'Check progress',
          scheduledFor: '2024-01-15T09:00:00.000Z',
        })
        .expect(HttpStatus.CREATED)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('taskId');
          expect(res.body).toHaveProperty('type');
          expect(res.body).toHaveProperty('title');
          expect(res.body).toHaveProperty('status');
          expect(res.body).toHaveProperty('scheduledFor');
          expect(mockRemindersServiceImpl.createReminder).toHaveBeenCalledWith(
            expect.objectContaining({
              userId: 'testuser',
              taskId: 'task-123',
              type: 'custom',
              title: 'Check progress',
            }),
          );
        });
    });
  });

  describe('unauthenticated routes', () => {
    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [RemindersController],
        providers: [
          { provide: RemindersService, useValue: mockRemindersServiceImpl },
        ],
      })
        .overrideGuard(AuthGuard)
        .useClass(MockAuthGuardDeny)
        .compile();

      app = await createApp(moduleRef);
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /api/reminders - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .get('/api/reminders')
        .expect(HttpStatus.FORBIDDEN);
    });

    it('POST /api/reminders - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .post('/api/reminders')
        .send({ taskId: 'task-123', title: 'Test', scheduledFor: '2024-01-15T09:00:00.000Z' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('DELETE /api/reminders/:id - returns 403 without auth', () => {
      return request(app.getHttpServer())
        .delete('/api/reminders/rem-123')
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});

// =========================================================================
//  8. NotificationsController
// =========================================================================

describe('NotificationsController (e2e)', () => {
  let app: INestApplication<App>;

  const mockPreferences = {
    userId: 'testuser',
    email: 'test@example.com',
    channels: {
      email: { enabled: true, address: 'test@example.com', digestMode: 'real-time' },
      slack_dm: { enabled: true },
      slack_channel: { enabled: false },
    },
    quietHours: {
      enabled: false,
      startTime: '18:00',
      endTime: '09:00',
      daysOfWeek: [1, 2, 3, 4, 5],
      bypassForUrgent: true,
    },
    eventPreferences: { task_created: false, task_failed: true },
    unsubscribed: { email: false, slackDm: false, slackChannel: false },
    unsubscribeToken: 'token-abc',
    timezone: 'UTC',
  };

  const mockNotificationsServiceImpl = {
    getOrCreatePreferences: jest.fn().mockResolvedValue(mockPreferences),
    updatePreferences: jest.fn().mockResolvedValue(mockPreferences),
    getNotificationHistory: jest.fn().mockResolvedValue({
      logs: [{ id: 'log-1', eventType: 'task_failed', status: 'sent' }],
      total: 1,
    }),
    unsubscribe: jest.fn().mockResolvedValue(mockPreferences),
    resubscribe: jest.fn().mockResolvedValue(mockPreferences),
  };

  // NotificationsController does NOT use AuthGuard (it is commented out)
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: mockNotificationsServiceImpl },
      ],
    }).compile();

    app = await createApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -- GET /api/notifications/preferences --
  it('GET /api/notifications/preferences - returns preferences (200)', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/preferences')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toHaveProperty('userId');
        expect(res.body).toHaveProperty('channels');
        expect(res.body).toHaveProperty('quietHours');
        expect(res.body).toHaveProperty('eventPreferences');
      });
  });

  // -- PATCH /api/notifications/preferences --
  it('PATCH /api/notifications/preferences - updates preferences (200)', () => {
    return request(app.getHttpServer())
      .patch('/api/notifications/preferences')
      .send({ channels: { email: { enabled: false } } })
      .expect(HttpStatus.OK)
      .expect(() => {
        expect(mockNotificationsServiceImpl.updatePreferences).toHaveBeenCalled();
      });
  });

  // -- POST /api/notifications/preferences/reset --
  it('POST /api/notifications/preferences/reset - resets preferences (201)', () => {
    return request(app.getHttpServer())
      .post('/api/notifications/preferences/reset')
      .expect(HttpStatus.CREATED)
      .expect(() => {
        expect(mockNotificationsServiceImpl.updatePreferences).toHaveBeenCalled();
        expect(mockNotificationsServiceImpl.getOrCreatePreferences).toHaveBeenCalled();
      });
  });

  // -- GET /api/notifications/history --
  it('GET /api/notifications/history - returns notification history (200)', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/history')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toHaveProperty('logs');
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('page', 1);
        expect(res.body).toHaveProperty('limit', 20);
      });
  });

  it('GET /api/notifications/history?page=2&limit=5 - passes pagination', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/history?page=2&limit=5')
      .expect(HttpStatus.OK)
      .expect(() => {
        expect(mockNotificationsServiceImpl.getNotificationHistory).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'test-user' }),
          2,
          5,
        );
      });
  });

  it('GET /api/notifications/history?status=sent&channel=email - passes filters', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/history?status=sent&channel=email&eventType=task_failed')
      .expect(HttpStatus.OK)
      .expect(() => {
        expect(mockNotificationsServiceImpl.getNotificationHistory).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'sent',
            channel: 'email',
            eventType: 'task_failed',
          }),
          1,
          20,
        );
      });
  });

  // -- GET /api/notifications/preferences/unsubscribe/:token --
  it('GET /api/notifications/preferences/unsubscribe/:token - returns HTML (200)', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/preferences/unsubscribe/token-abc')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.text).toContain('Unsubscribed');
        expect(res.text).toContain('<!DOCTYPE html>');
        expect(mockNotificationsServiceImpl.unsubscribe).toHaveBeenCalledWith(
          'token-abc',
          undefined,
        );
      });
  });

  it('GET /api/notifications/preferences/unsubscribe/:token?channel=email - passes channel', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/preferences/unsubscribe/token-abc?channel=email')
      .expect(HttpStatus.OK)
      .expect(() => {
        expect(mockNotificationsServiceImpl.unsubscribe).toHaveBeenCalledWith(
          'token-abc',
          'email',
        );
      });
  });

  it('GET /api/notifications/preferences/unsubscribe/:token - 404 for invalid token', async () => {
    mockNotificationsServiceImpl.unsubscribe.mockResolvedValueOnce(null);
    return request(app.getHttpServer())
      .get('/api/notifications/preferences/unsubscribe/invalid-token')
      .expect(HttpStatus.NOT_FOUND);
  });

  // -- GET /api/notifications/preferences/resubscribe/:token --
  it('GET /api/notifications/preferences/resubscribe/:token - returns HTML (200)', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/preferences/resubscribe/token-abc')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.text).toContain('Resubscribed');
        expect(res.text).toContain('<!DOCTYPE html>');
        expect(mockNotificationsServiceImpl.resubscribe).toHaveBeenCalledWith(
          'token-abc',
          undefined,
        );
      });
  });

  it('GET /api/notifications/preferences/resubscribe/:token - 404 for invalid token', async () => {
    mockNotificationsServiceImpl.resubscribe.mockResolvedValueOnce(null);
    return request(app.getHttpServer())
      .get('/api/notifications/preferences/resubscribe/invalid-token')
      .expect(HttpStatus.NOT_FOUND);
  });

  // -- GET /api/notifications/quiet-hours/status --
  it('GET /api/notifications/quiet-hours/status - returns quiet hours status (200)', () => {
    return request(app.getHttpServer())
      .get('/api/notifications/quiet-hours/status')
      .expect(HttpStatus.OK)
      .expect((res) => {
        expect(res.body).toHaveProperty('quietHoursEnabled');
        expect(res.body).toHaveProperty('isCurrentlyQuiet');
        expect(res.body).toHaveProperty('currentTime');
        expect(res.body).toHaveProperty('timezone');
      });
  });
});
