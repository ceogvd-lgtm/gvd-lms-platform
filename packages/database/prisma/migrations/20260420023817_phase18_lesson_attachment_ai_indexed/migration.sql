-- AlterTable
ALTER TABLE "lesson_attachments" ADD COLUMN     "aiIndexed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiIndexedAt" TIMESTAMP(3);
