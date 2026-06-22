-- Multi-tenancy: per-organization ownership for structural content.
-- null = platform-shared (authored by the platform team); set = private to an institution.
-- Mirrors the soft `organizationId` column already on questions and mock_tests (RLS-ready).

ALTER TABLE "curriculums" ADD COLUMN "organizationId" UUID;
CREATE INDEX "curriculums_organizationId_idx" ON "curriculums"("organizationId");

ALTER TABLE "exam_profiles" ADD COLUMN "organizationId" UUID;
CREATE INDEX "exam_profiles_organizationId_idx" ON "exam_profiles"("organizationId");

ALTER TABLE "learning_tracks" ADD COLUMN "organizationId" UUID;
CREATE INDEX "learning_tracks_organizationId_idx" ON "learning_tracks"("organizationId");
