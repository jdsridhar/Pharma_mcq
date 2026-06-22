-- Advanced constraints & policies that Prisma cannot express declaratively.
-- These objects are INVISIBLE to Prisma's drift detection (CHECK constraints,
-- functions, triggers, RLS policies, extensions), so they coexist with the
-- Prisma-managed baseline without causing drift on `migrate dev`.
--
-- (Index/column/partition objects that WOULD drift live in prisma/sql/ instead.)

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── CHECK constraints (data integrity the schema can't declare) ──────────────
ALTER TABLE exam_blueprint_items
  ADD CONSTRAINT chk_weight_percent CHECK ("weightPercent" >= 0 AND "weightPercent" <= 100);
ALTER TABLE exam_blueprint_items
  ADD CONSTRAINT chk_question_count_nonneg CHECK ("questionCount" >= 0);
ALTER TABLE plan_prices
  ADD CONSTRAINT chk_plan_amount_nonneg CHECK ("amountMinor" >= 0);
ALTER TABLE payments
  ADD CONSTRAINT chk_payment_amount_nonneg CHECK ("amountMinor" >= 0);
ALTER TABLE results
  ADD CONSTRAINT chk_accuracy_range CHECK (accuracy >= 0 AND accuracy <= 1);
ALTER TABLE results
  ADD CONSTRAINT chk_percentile_range CHECK (percentile IS NULL OR (percentile >= 0 AND percentile <= 100));
ALTER TABLE knowledge_edges
  ADD CONSTRAINT chk_no_self_loop CHECK ("parentNodeId" <> "childNodeId");
ALTER TABLE question_versions
  ADD CONSTRAINT chk_version_number_positive CHECK ("versionNumber" >= 1);

-- ── Knowledge graph: prevent cycles among HIERARCHICAL edge types (DAG) ───────
-- Associative edges (RELATED_TO) may form cycles and are excluded.
CREATE OR REPLACE FUNCTION knowledge_edge_acyclic() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."relationshipType" IN ('IS_A', 'PART_OF', 'PREREQUISITE_OF') THEN
    IF EXISTS (
      WITH RECURSIVE reachable AS (
        SELECT e."childNodeId" AS node
          FROM knowledge_edges e
          WHERE e."parentNodeId" = NEW."childNodeId"
            AND e."relationshipType" IN ('IS_A', 'PART_OF', 'PREREQUISITE_OF')
        UNION
        SELECT e."childNodeId"
          FROM knowledge_edges e
          JOIN reachable r ON e."parentNodeId" = r.node
          WHERE e."relationshipType" IN ('IS_A', 'PART_OF', 'PREREQUISITE_OF')
      )
      SELECT 1 FROM reachable WHERE node = NEW."parentNodeId"
    ) THEN
      RAISE EXCEPTION 'knowledge_edges: hierarchical cycle detected (% -> %)',
        NEW."parentNodeId", NEW."childNodeId";
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_knowledge_edge_acyclic ON knowledge_edges;
CREATE TRIGGER trg_knowledge_edge_acyclic
  BEFORE INSERT OR UPDATE ON knowledge_edges
  FOR EACH ROW EXECUTE FUNCTION knowledge_edge_acyclic();

-- ── Append-only audit log (no UPDATE/DELETE) ─────────────────────────────────
CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- ── Multi-tenant Row-Level Security scaffolding (§7-A) ────────────────────────
-- Single-tenant runtime: when the GUC `app.current_org` is unset, policies allow
-- all rows. Production sets it per request (SET LOCAL app.current_org = '<uuid>')
-- and connects as a non-owner role so isolation is enforced.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
  org_tables text[] := ARRAY[
    'users', 'student_profiles', 'practice_sessions', 'test_sessions',
    'mock_tests', 'subscriptions', 'payments', 'notifications', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (app_current_org() IS NULL OR "organizationId" IS NOT DISTINCT FROM app_current_org()) '
      'WITH CHECK (app_current_org() IS NULL OR "organizationId" IS NOT DISTINCT FROM app_current_org())',
      t
    );
  END LOOP;
END $$;
