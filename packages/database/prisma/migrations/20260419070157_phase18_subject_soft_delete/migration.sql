-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "subjects_isDeleted_idx" ON "subjects"("isDeleted");
