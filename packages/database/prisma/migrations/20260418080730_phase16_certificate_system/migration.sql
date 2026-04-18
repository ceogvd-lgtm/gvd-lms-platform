-- AlterTable
ALTER TABLE "certificate_criteria" ADD COLUMN     "gradeThresholds" JSONB NOT NULL DEFAULT '{"excellent":90,"good":80,"pass":70}',
ALTER COLUMN "minPassScore" SET DEFAULT 70,
ALTER COLUMN "minProgress" SET DEFAULT 100,
ALTER COLUMN "requiredLessons" SET DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "minPracticeScore" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "certificates" ADD COLUMN     "finalScore" INTEGER,
ADD COLUMN     "grade" TEXT,
ADD COLUMN     "pdfUrl" TEXT;
