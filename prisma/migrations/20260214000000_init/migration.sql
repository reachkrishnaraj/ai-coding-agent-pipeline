-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('received', 'analyzing', 'needs_clarification', 'dispatched', 'coding', 'pr_open', 'merged', 'failed');

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'received',
    "description" TEXT NOT NULL,
    "task_type_hint" TEXT,
    "repo" TEXT NOT NULL DEFAULT 'mothership/finance-service',
    "files_hint" TEXT,
    "acceptance_criteria" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "llm_analysis" JSONB,
    "llm_summary" TEXT,
    "task_type" TEXT,
    "recommended_agent" TEXT,
    "likely_files" JSONB,
    "suggested_criteria" JSONB,
    "clarification_questions" JSONB,
    "clarification_answers" JSONB,
    "is_clarified" BOOLEAN NOT NULL DEFAULT false,
    "github_issue_number" INTEGER,
    "github_issue_url" TEXT,
    "github_pr_number" INTEGER,
    "github_pr_url" TEXT,
    "github_pr_status" TEXT,
    "github_branch" TEXT,
    "slack_user_id" TEXT,
    "slack_channel_id" TEXT,
    "slack_thread_ts" TEXT,
    "createdBy" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "dispatched_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_repo_idx" ON "tasks"("repo");

-- CreateIndex
CREATE INDEX "tasks_created_at_idx" ON "tasks"("created_at" DESC);

-- CreateIndex
CREATE INDEX "tasks_github_issue_number_idx" ON "tasks"("github_issue_number");

-- CreateIndex
CREATE INDEX "task_events_task_id_created_at_idx" ON "task_events"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
