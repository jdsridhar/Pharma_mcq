-- Multi-tenancy: scope questionCode uniqueness PER ORGANIZATION (not globally), among live rows.
-- Replaces the global unique index with two partial unique indexes:
--   * institution-private rows: unique per (organizationId, questionCode)
--   * platform-shared rows (organizationId IS NULL): unique by questionCode
-- Both ignore soft-deleted rows (deletedAt IS NOT NULL), so deleting a question frees its code.
-- This lets each institution keep its own code namespace and removes the cross-tenant collision.

DROP INDEX IF EXISTS "questions_questionCode_key";

CREATE UNIQUE INDEX "questions_org_questionCode_key"
  ON "questions" ("organizationId", "questionCode")
  WHERE "organizationId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "questions_shared_questionCode_key"
  ON "questions" ("questionCode")
  WHERE "organizationId" IS NULL AND "deletedAt" IS NULL;
