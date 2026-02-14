# CR-001: Migrate from PostgreSQL + Prisma to MongoDB + Mongoose

**Type:** Change Request
**Priority:** High — blocking local development
**Status:** Ready for implementation
**Affects:** All agents (core-api, integrations, web-ui, slack, deploy)
**Branch:** `refactor/mongodb-migration`

---

## 1. Rationale

The current implementation uses PostgreSQL with Prisma ORM, requiring rigid schema definitions and migrations. MongoDB provides:

- **Flexible schema** — fields can be added/modified without migrations
- **Native JSON storage** — LLM responses, clarification Q&A, and event payloads store naturally as documents
- **Simpler iteration** — no migration files to manage during rapid prototyping
- **Embedded documents** — task events can be embedded directly in the task document

**There is no existing data to migrate.** The PostgreSQL database was never populated. Treat this as a fresh implementation.

---

## 2. Summary of Changes

| What | From | To |
|------|------|----|
| Database | PostgreSQL 16 | MongoDB 7 |
| ORM | Prisma 6 (`@prisma/client`) | Mongoose 8 (`mongoose`, `@nestjs/mongoose`) |
| Schema definition | `prisma/schema.prisma` | `src/common/schemas/*.schema.ts` (Mongoose schemas) |
| Migrations | `prisma migrate` | None needed (schemaless) |
| Connection | `PrismaService` extends `PrismaClient` | `MongooseModule.forRoot()` |
| Status enum | `@prisma/client` → `TaskStatus` enum | Local TypeScript enum in `src/common/enums/task-status.enum.ts` |
| Docker service | `postgres:16` | `mongo:7` |
| Env var | `DATABASE_URL=postgresql://...` | `MONGODB_URI=mongodb://...` |

---

## 3. Packages to Remove

```bash
pnpm remove @prisma/client prisma
```

## 4. Packages to Add

```bash
pnpm add mongoose @nestjs/mongoose
```

---

## 5. Files to DELETE

| File | Reason |
|------|--------|
| `prisma/schema.prisma` | Replaced by Mongoose schemas |
| `prisma/migrations/` (entire directory) | No migrations with MongoDB |
| `prisma/seed.ts` (if exists) | Replace with Mongoose seeder |
| `src/prisma/prisma.service.ts` | Replaced by Mongoose connection |
| `src/prisma/prisma.module.ts` | Replaced by MongooseModule |

---

## 6. Files to CREATE

### 6.1 Mongoose Schemas

#### `src/common/schemas/task.schema.ts`

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TaskStatus } from '../enums/task-status.enum';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  // Source
  @Prop({ required: true })
  source: string; // 'web' | 'slack' | 'api' | 'asana'

  @Prop({ required: true, default: TaskStatus.RECEIVED, index: true })
  status: string;

  // User input
  @Prop({ required: true })
  description: string;

  @Prop()
  taskTypeHint?: string;

  @Prop({ default: 'mothership/finance-service', index: true })
  repo: string;

  @Prop()
  filesHint?: string;

  @Prop()
  acceptanceCriteria?: string;

  @Prop({ default: 'normal' })
  priority: string;

  // LLM analysis (flexible — stored as-is from OpenAI)
  @Prop({ type: Object })
  llmAnalysis?: Record<string, any>;

  @Prop()
  llmSummary?: string;

  @Prop()
  taskType?: string;

  @Prop()
  recommendedAgent?: string;

  @Prop({ type: [String] })
  likelyFiles?: string[];

  @Prop({ type: [String] })
  suggestedCriteria?: string[];

  // Clarification
  @Prop({ type: [String] })
  clarificationQuestions?: string[];

  @Prop({ type: [String] })
  clarificationAnswers?: string[];

  @Prop({ default: false })
  isClarified: boolean;

  // GitHub
  @Prop()
  githubIssueNumber?: number;

  @Prop()
  githubIssueUrl?: string;

  @Prop()
  githubPrNumber?: number;

  @Prop()
  githubPrUrl?: string;

  @Prop()
  githubPrStatus?: string;

  @Prop()
  githubBranch?: string;

  // Slack
  @Prop()
  slackUserId?: string;

  @Prop()
  slackChannelId?: string;

  @Prop()
  slackThreadTs?: string;

  // Meta
  @Prop()
  createdBy?: string;

  @Prop()
  dispatchedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  errorMessage?: string;

  // Embedded events (denormalized for fast reads)
  @Prop({ type: [{ eventType: String, payload: Object, createdAt: { type: Date, default: Date.now } }] })
  events: Array<{
    eventType: string;
    payload?: Record<string, any>;
    createdAt: Date;
  }>;
}

export const TaskSchema = SchemaFactory.createForClass(Task);

// Indexes
TaskSchema.index({ status: 1 });
TaskSchema.index({ repo: 1 });
TaskSchema.index({ createdAt: -1 });
TaskSchema.index({ githubIssueNumber: 1 }, { sparse: true });
TaskSchema.index({ slackThreadTs: 1 }, { sparse: true });
```

> **Design decision:** Task events are embedded inside the task document as an array, rather than being a separate collection. This simplifies queries (no joins/populates) and is the MongoDB-native pattern for audit logs that are always read alongside the parent document.

#### `src/common/enums/task-status.enum.ts`

```typescript
export enum TaskStatus {
  RECEIVED = 'received',
  ANALYZING = 'analyzing',
  NEEDS_CLARIFICATION = 'needs_clarification',
  DISPATCHED = 'dispatched',
  CODING = 'coding',
  PR_OPEN = 'pr_open',
  MERGED = 'merged',
  FAILED = 'failed',
}
```

### 6.2 Database Module

#### `src/database/database.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
  ],
})
export class DatabaseModule {}
```

---

## 7. Files to MODIFY

### 7.1 `src/app.module.ts`

**Replace** `PrismaModule` import with `DatabaseModule` and Mongoose feature imports:

```typescript
import { DatabaseModule } from './database/database.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from './common/schemas/task.schema';

// In imports array:
// REMOVE: PrismaModule
// ADD:    DatabaseModule
```

### 7.2 `src/tasks/tasks.module.ts`

**Replace** PrismaModule import with MongooseModule feature registration:

```typescript
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../common/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
    // ... other imports
  ],
  // ...
})
```

### 7.3 `src/tasks/tasks.service.ts` — MAJOR REWRITE

This is the largest change. Replace all Prisma calls with Mongoose equivalents:

| Prisma Pattern | Mongoose Equivalent |
|----------------|---------------------|
| `constructor(private prisma: PrismaService)` | `constructor(@InjectModel(Task.name) private taskModel: Model<TaskDocument>)` |
| `this.prisma.task.create({ data: {...} })` | `new this.taskModel({...}).save()` |
| `this.prisma.task.findUnique({ where: { id } })` | `this.taskModel.findById(id).exec()` |
| `this.prisma.task.findFirst({ where: {...} })` | `this.taskModel.findOne({...}).exec()` |
| `this.prisma.task.findMany({ where, skip, take, orderBy })` | `this.taskModel.find(where).skip(skip).limit(take).sort({ createdAt: -1 }).exec()` |
| `this.prisma.task.update({ where: { id }, data: {...} })` | `this.taskModel.findByIdAndUpdate(id, { $set: {...} }, { new: true }).exec()` |
| `this.prisma.task.delete({ where: { id } })` | `this.taskModel.findByIdAndDelete(id).exec()` |
| `this.prisma.task.count({ where })` | `this.taskModel.countDocuments(where).exec()` |
| `this.prisma.$queryRaw\`SELECT 1\`` | `this.taskModel.db.db.admin().ping()` |
| `import { TaskStatus } from '@prisma/client'` | `import { TaskStatus } from '../common/enums/task-status.enum'` |

**Event logging** — Replace separate `taskEvent.create()` calls with embedded push:

```typescript
// OLD (Prisma — separate table):
await this.prisma.taskEvent.create({
  data: { taskId, eventType, payload }
});

// NEW (Mongoose — embedded array):
await this.taskModel.findByIdAndUpdate(taskId, {
  $push: {
    events: { eventType, payload, createdAt: new Date() }
  }
}).exec();
```

**Task ID format** — MongoDB uses `_id` (ObjectId) instead of UUID. Update:
- `findUnique({ where: { id } })` → `findById(id)`
- The `id` field in API responses maps to `_id.toString()`
- Add a virtual or transform in the schema to expose `id`:

```typescript
TaskSchema.set('toJSON', {
  virtuals: true,
  transform: (_, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
```

### 7.4 `src/github/github-webhook.controller.ts`

**Replace** all Prisma calls with Mongoose:

| Line | Change |
|------|--------|
| `import { PrismaService } from '../prisma/prisma.service'` | `import { InjectModel } from '@nestjs/mongoose'` + `import { Model } from 'mongoose'` + `import { Task, TaskDocument } from '../common/schemas/task.schema'` |
| `import { TaskStatus } from '@prisma/client'` | `import { TaskStatus } from '../common/enums/task-status.enum'` |
| `private readonly prisma: PrismaService` (constructor) | `@InjectModel(Task.name) private taskModel: Model<TaskDocument>` |
| `this.prisma.task.findFirst({ where: { githubIssueNumber, repo } })` | `this.taskModel.findOne({ githubIssueNumber: issueNumber, repo: repository?.full_name }).exec()` |
| `this.prisma.task.update({ where: { id }, data: {...} })` | `this.taskModel.findByIdAndUpdate(task._id, { $set: {...} }, { new: true }).exec()` |
| `this.prisma.taskEvent.create({ data: {...} })` | `this.taskModel.findByIdAndUpdate(task._id, { $push: { events: {...} } }).exec()` |

### 7.5 `src/slack/slack-webhook.controller.ts`

**Replace** Prisma direct access patterns:

| Line | Change |
|------|--------|
| `this.tasksService['prisma'].task.update(...)` | Expose proper methods on `TasksService` instead of accessing private Prisma field |
| `this.tasksService['prisma'].task.findFirst(...)` | Add `TasksService.findBySlackThread(threadTs)` method |

Add these methods to `TasksService`:

```typescript
async updateSlackInfo(taskId: string, slackUserId: string, slackChannelId: string) {
  return this.taskModel.findByIdAndUpdate(taskId, {
    $set: { slackUserId, slackChannelId }
  }, { new: true }).exec();
}

async updateSlackThreadTs(taskId: string, threadTs: string) {
  return this.taskModel.findByIdAndUpdate(taskId, {
    $set: { slackThreadTs: threadTs }
  }, { new: true }).exec();
}

async findBySlackThread(threadTs: string) {
  return this.taskModel.findOne({
    slackThreadTs: threadTs,
    status: TaskStatus.NEEDS_CLARIFICATION,
  }).exec();
}
```

### 7.6 `src/tasks/health.controller.ts`

**Replace** Prisma health check:

```typescript
// OLD:
await this.prisma.$queryRaw`SELECT 1`;

// NEW:
const conn = this.connection; // inject Mongoose Connection
await conn.db.admin().ping();
```

### 7.7 `src/github/github.module.ts`

**Add** MongooseModule.forFeature import so the webhook controller can inject the Task model:

```typescript
import { MongooseModule } from '@nestjs/mongoose';
import { Task, TaskSchema } from '../common/schemas/task.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
  // ...
})
```

### 7.8 `src/slack/slack.module.ts`

Same as above — register the Task model so Slack module can query tasks.

---

## 8. Test File Changes

All test files that mock `PrismaService` need to mock Mongoose Model instead:

| Pattern | Change |
|---------|--------|
| `PrismaService` mock with `.task.create`, `.task.findUnique` | Mock `Model<TaskDocument>` with `.save()`, `.findById()`, `.findOne()`, `.find()`, `.findByIdAndUpdate()`, `.findByIdAndDelete()`, `.countDocuments()` |
| `TaskStatus` import from `@prisma/client` | Import from `../common/enums/task-status.enum` |

**Affected test files:**
- `src/tasks/tasks.service.spec.ts`
- `src/tasks/tasks.controller.spec.ts`
- `src/github/github-webhook.controller.spec.ts`
- `src/slack/slack-webhook.controller.spec.ts`
- `src/slack/slack.service.spec.ts`
- `src/auth/auth.guard.spec.ts` (if it references Prisma)

Standard Mongoose mock pattern for tests:

```typescript
const mockTaskModel = {
  find: jest.fn().mockReturnThis(),
  findById: jest.fn().mockReturnThis(),
  findOne: jest.fn().mockReturnThis(),
  findByIdAndUpdate: jest.fn().mockReturnThis(),
  findByIdAndDelete: jest.fn().mockReturnThis(),
  countDocuments: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

// In test module:
providers: [
  { provide: getModelToken(Task.name), useValue: mockTaskModel },
]
```

---

## 9. Docker Changes

### 9.1 `docker-compose.yml`

**Replace** the `postgres` service with `mongo`:

```yaml
  mongo:
    image: mongo:7
    container_name: ai-pipeline-db
    restart: unless-stopped
    ports:
      - "27017:27017"
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: admin
      MONGO_INITDB_DATABASE: ai_pipeline
    volumes:
      - mongodata:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 5
```

**Update** the `app` service environment:

```yaml
    environment:
      - MONGODB_URI=mongodb://admin:admin@mongo:27017/ai_pipeline?authSource=admin
```

**Update** volumes:

```yaml
volumes:
  mongodata:
```

### 9.2 `.env`

```bash
# REMOVE:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_pipeline?schema=public

# ADD:
MONGODB_URI=mongodb://admin:admin@localhost:27017/ai_pipeline?authSource=admin
```

### 9.3 `.env.example`

```bash
# REMOVE:
# DATABASE_URL=postgresql://user:pass@host:5432/ai_pipeline

# ADD:
MONGODB_URI=mongodb://admin:admin@localhost:27017/ai_pipeline?authSource=admin
```

---

## 10. `package.json` Script Changes

| Script | Old | New |
|--------|-----|-----|
| `db:generate` | `prisma generate` | **REMOVE** (not needed with Mongoose) |
| `db:migrate` | `prisma migrate deploy` | **REMOVE** (schemaless) |
| `db:seed` | `ts-node prisma/seed.ts` | `ts-node src/common/scripts/seed.ts` (optional) |
| `build:prod` | includes `pnpm run db:generate` | Remove the `db:generate` step |

---

## 11. CLAUDE.md Updates

Update these lines in `CLAUDE.md`:

| Section | Old | New |
|---------|-----|-----|
| Tech Stack | `Prisma 6, PostgreSQL 16` | `Mongoose 8, MongoDB 7` |
| Hosting | `Railway (container + managed Postgres)` | `Railway (container + MongoDB Atlas or Railway MongoDB plugin)` |
| Project Structure | `prisma/  # Schema and migrations` | `src/common/schemas/  # Mongoose schemas` |
| Code Style | `Use Prisma for ALL database access (never raw SQL)` | `Use Mongoose for ALL database access (never raw MongoDB driver calls)` |
| Env vars | `Required: DATABASE_URL` | `Required: MONGODB_URI` |

---

## 12. SPEC.md Updates

Update these sections in `SPEC.md`:

| Section | Change |
|---------|--------|
| Header line 4 | `**State:** Persistent (PostgreSQL)` → `**State:** Persistent (MongoDB)` |
| Section 3 | Replace SQL `CREATE TABLE` with Mongoose schema reference. Keep field names identical. |
| Section 9 | Replace `DATABASE_URL=postgresql://...` with `MONGODB_URI=mongodb://...` |
| Section 10 (Tech Stack table) | Database: `MongoDB 7`, ORM: `Mongoose 8` |
| Section 14 (Error Handling) | `Database connection lost` → same behavior, different driver error |
| Section 15 (Railway) | Add note: use MongoDB Atlas or Railway MongoDB plugin |
| Section 19 (Security) | `SQL injection → Prisma ORM` → `NoSQL injection → Mongoose schema validation + sanitization` |

---

## 13. Agent Configuration Updates

Update these agent definition files in `.claude/agents/`:

### `core-api.md`
- Remove references to "Prisma Schema" and "Create the initial migration"
- Replace with "Mongoose Schema" in `src/common/schemas/`
- Remove `prisma/` from deliverables
- Add `src/database/database.module.ts` to deliverables
- Add `src/common/enums/task-status.enum.ts` to deliverables
- Change "Use Prisma for all DB access" → "Use Mongoose for all DB access"

### `deploy.md`
- Docker: replace postgres:16 with mongo:7
- Remove `npx prisma migrate deploy` from Railway deploy command
- Remove `db:migrate` and `db:generate` from package.json scripts

### `coordinator.md`, `integrations.md`, `web-ui.md`, `slack.md`
- Any references to "Prisma" → "Mongoose"
- Any references to "PostgreSQL" → "MongoDB"

---

## 14. Implementation Order

This is a single-branch refactor. The recommended order within the branch:

1. **Install packages** — remove Prisma, add Mongoose
2. **Create new files** — enums, schemas, database module
3. **Rewrite `tasks.service.ts`** — largest file, core business logic
4. **Update `github-webhook.controller.ts`** — replace Prisma with Mongoose
5. **Update `slack-webhook.controller.ts`** — replace Prisma direct access with proper service methods
6. **Update `app.module.ts`** — swap PrismaModule for DatabaseModule
7. **Update all module files** — register MongooseModule.forFeature
8. **Delete Prisma files** — `prisma/`, `src/prisma/`
9. **Update tests** — replace Prisma mocks with Mongoose mocks
10. **Update Docker** — swap postgres for mongo in docker-compose.yml
11. **Update env files** — DATABASE_URL → MONGODB_URI
12. **Update docs** — CLAUDE.md, SPEC.md, package.json scripts
13. **Verify** — `pnpm build` compiles, `pnpm test` passes

---

## 15. Verification Checklist

After implementation, confirm:

- [ ] `pnpm build` — no TypeScript errors
- [ ] `pnpm test` — all tests pass
- [ ] `docker-compose up -d` — MongoDB starts and is healthy
- [ ] `POST /api/tasks` — creates a task document in MongoDB
- [ ] `GET /api/tasks` — returns paginated results
- [ ] `GET /api/tasks/:id` — returns task with embedded events
- [ ] `POST /api/tasks/:id/clarify` — updates task and re-dispatches
- [ ] `GET /api/health` — returns `{ status: "ok", db: "connected" }`
- [ ] No references to `prisma`, `@prisma/client`, or `PrismaService` remain in `src/`
- [ ] No `prisma/` directory remains in the project root
