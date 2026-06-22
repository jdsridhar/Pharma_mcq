-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  OPERATIONAL SQL — apply AFTER `prisma migrate deploy`.                      ║
-- ║                                                                            ║
-- ║  Apply: pnpm --filter @pharmacy/api exec prisma db execute \                ║
-- ║           --file prisma/sql/search_and_partitioning.sql --schema prisma/schema.prisma
-- ║                                                                            ║
-- ║  These objects (extra indexes, a generated column, a partitioned table)     ║
-- ║  WOULD be flagged as drift by `prisma migrate dev`, so they are deliberately ║
-- ║  kept OUT of Prisma's migration history and applied operationally. Use the   ║
-- ║  `migrate deploy` (not `migrate dev`) workflow in any DB where these exist.  ║
-- ║  See DATABASE_INDEXING.md §Operational objects.                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Near-duplicate detection (Golden Rule enforcement, §L-2) ──────────────────
-- Trigram index over question text powers similarity('a','b') / "%" lookups at
-- ingestion to surface possible duplicates for reviewer attention.
CREATE INDEX IF NOT EXISTS idx_question_versions_text_trgm
  ON question_versions USING gin ("questionText" gin_trgm_ops);

-- Exact-duplicate fast path is the btree on normalizedTextHash (Prisma-managed).

-- ── Full-text search over question content (§Search Architecture, Phase-1 PG FTS)
ALTER TABLE question_versions
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("questionText", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("explanation", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_question_versions_search
  ON question_versions USING gin (search_vector);

-- ── Analytics event store: monthly RANGE partitioning (§S-1) ──────────────────
-- The Prisma baseline creates `events` as a normal table. When event volume
-- warrants, run the block below ONCE (events is empty at bootstrap) to convert it
-- to a partitioned table. After this, `events` is managed operationally (not by
-- Prisma). Cold partitions are archived to S3/Parquet and detached.

-- Helper: create a monthly partition for a given month start (idempotent).
CREATE OR REPLACE FUNCTION create_events_partition(p_month date) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  start_ts date := date_trunc('month', p_month)::date;
  end_ts   date := (date_trunc('month', p_month) + interval '1 month')::date;
  part     text := format('events_%s', to_char(start_ts, 'YYYY_MM'));
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
    part, start_ts, end_ts
  );
END $$;

-- Conversion (run once; commented to avoid accidental execution on an empty install):
--
-- BEGIN;
-- ALTER TABLE events RENAME TO events_legacy;
-- CREATE TABLE events (
--   id            uuid        NOT NULL DEFAULT gen_random_uuid(),
--   "organizationId" uuid,
--   "userId"      uuid,
--   type          text        NOT NULL,
--   "entityType"  text,
--   "entityId"    uuid,
--   payload       jsonb,
--   "occurredAt"  timestamptz(6) NOT NULL DEFAULT now(),
--   "createdAt"   timestamptz(6) NOT NULL DEFAULT now(),
--   PRIMARY KEY (id, "occurredAt")
-- ) PARTITION BY RANGE ("occurredAt");
-- CREATE INDEX events_userId_occurredAt_idx ON events ("userId", "occurredAt");
-- CREATE INDEX events_type_occurredAt_idx   ON events (type, "occurredAt");
-- CREATE INDEX events_entityType_entityId_idx ON events ("entityType", "entityId");
-- CREATE TABLE events_default PARTITION OF events DEFAULT;
-- SELECT create_events_partition((date_trunc('month', now()) + (n || ' month')::interval)::date)
--   FROM generate_series(-1, 3) AS n;  -- last month + current + 3 ahead
-- INSERT INTO events SELECT * FROM events_legacy;  -- empty at bootstrap
-- DROP TABLE events_legacy;
-- COMMIT;
--
-- Schedule `SELECT create_events_partition(...)` monthly via a BullMQ repeatable
-- job (preferred) or pg_cron, creating a few months ahead.
