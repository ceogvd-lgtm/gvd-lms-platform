-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupTriggerType" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateTable
CREATE TABLE "backups" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "minioKey" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT NOT NULL,
    "triggerType" "BackupTriggerType" NOT NULL DEFAULT 'MANUAL',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backups_createdAt_idx" ON "backups"("createdAt");

-- CreateIndex
CREATE INDEX "backups_status_idx" ON "backups"("status");
