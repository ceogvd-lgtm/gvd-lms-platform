-- Phase 17 — AI Learning Assistant
-- Adds four tables for the Gemini-backed chat / recommendation / quota
-- subsystem. No changes to existing tables.

-- AiRecommendation: adaptive cards shown on the student dashboard.
CREATE TABLE "ai_recommendations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lessonId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_recommendations_studentId_isRead_idx"
    ON "ai_recommendations"("studentId", "isRead");

ALTER TABLE "ai_recommendations"
    ADD CONSTRAINT "ai_recommendations_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_recommendations"
    ADD CONSTRAINT "ai_recommendations_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "lessons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AiChatMessage: chat transcript + thumbs rating.
CREATE TABLE "ai_chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lessonId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_chat_messages_sessionId_idx"
    ON "ai_chat_messages"("sessionId");

CREATE INDEX "ai_chat_messages_studentId_lessonId_idx"
    ON "ai_chat_messages"("studentId", "lessonId");

ALTER TABLE "ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AiQuotaLog: per-day counter for the admin AI health dashboard.
CREATE TABLE "ai_quota_logs" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_quota_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_quota_logs_date_model_key"
    ON "ai_quota_logs"("date", "model");

-- AiSuggestedQuestions: 24h cache of AI-generated question chips per lesson.
CREATE TABLE "ai_suggested_questions" (
    "lessonId" TEXT NOT NULL,
    "questions" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_suggested_questions_pkey" PRIMARY KEY ("lessonId")
);
