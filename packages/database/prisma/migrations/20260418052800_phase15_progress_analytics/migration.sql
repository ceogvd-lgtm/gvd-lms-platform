-- AlterTable
ALTER TABLE "course_enrollments" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "practice_attempts" ADD COLUMN     "hasCriticalViolation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "course_enrollments_lastActiveAt_idx" ON "course_enrollments"("lastActiveAt");

-- CreateIndex
CREATE INDEX "practice_attempts_studentId_hasCriticalViolation_idx" ON "practice_attempts"("studentId", "hasCriticalViolation");
