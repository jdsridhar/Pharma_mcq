-- Multi-tenancy: tenant owner for questions.
-- null = platform-shared (visible to every org); a value = private to that institution.

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "organizationId" UUID;

-- CreateIndex
CREATE INDEX "questions_organizationId_idx" ON "questions"("organizationId");
