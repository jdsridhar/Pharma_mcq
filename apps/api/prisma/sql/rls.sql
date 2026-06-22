-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Multi-tenancy MT-4: Postgres Row-Level Security (defense-in-depth at the DB layer).
--
-- Operational object (like search_and_partitioning.sql) — applied via `db:rls`, NOT a Prisma
-- migration (Prisma can't model roles/policies and would flag them as drift).
--
-- Model: the runtime app connects as the least-privilege role `pharmacy_app` (NOT a superuser and
-- NOT the table owner), so RLS applies to it. Each request sets two transaction-local GUCs:
--   app.current_org : the caller's organization id (empty = none)
--   app.is_super    : 'on' to bypass tenant scoping (Super Admin, and system jobs/seeders/auth
--                     flows that run with no tenant context)
-- Migrations/seeds keep running as the owner (`postgres`), which bypasses RLS.
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- ── Least-privilege application role ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacy_app') THEN
    -- Dev/local password; production sets a strong password out-of-band (ALTER ROLE … PASSWORD …).
    CREATE ROLE pharmacy_app LOGIN PASSWORD 'pharmacy_app_dev';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO pharmacy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pharmacy_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pharmacy_app;
-- Future tables/sequences created by the owner inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharmacy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pharmacy_app;

-- ── Tenant context helpers (read transaction-local GUCs; safe defaults when unset) ────────────
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org', true), '')::uuid
$$;

-- Defaults to bypass ('on') when UNSET so trusted/system connections that set no tenant context
-- (Super Admin requests, BullMQ workers, seeders, public/auth routes) are unaffected. Scoping is
-- opt-in: the API sets app.is_super='off' (+ app.current_org) only for authenticated non-super
-- requests, which is where cross-tenant leakage must be prevented.
CREATE OR REPLACE FUNCTION app_is_super() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_super', true), 'on') = 'on'
$$;

-- ── Enable + force RLS and (re)create the tenant-isolation policy on each content table ────────
-- Visible/writable when: Super (bypass) OR platform-shared row (organizationId IS NULL) OR the
-- row belongs to the caller's organization. App-layer guards further restrict who may write shared.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['questions', 'mock_tests', 'curriculums', 'exam_profiles', 'learning_tracks'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app_is_super() OR "organizationId" IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_is_super() OR "organizationId" IS NULL OR "organizationId" = app_current_org())',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;
