# DATABASE_INDEXING.md — Phase 2

Index strategy mapped to the platform's hot paths. Declared indexes live in [`schema.prisma`](apps/api/prisma/schema.prisma) (`@@index`/`@@unique`); type-specific indexes that Prisma can't express are in [`prisma/sql/search_and_partitioning.sql`](apps/api/prisma/sql/search_and_partitioning.sql).

---

## 1. Hot paths → indexes

| # | Query (hot path) | Tables | Index(es) serving it |
|---|---|---|---|
| H1 | **Question selection** for an exam, by difficulty, excluding seen | `question_exam_mapping`, `questions` | `question_exam_mapping (examProfileId)` reverse index + PK `(questionId,examProfileId)`; `questions(status)`, `questions(calculatedDifficulty)`* |
| H2 | "Questions for knowledge node(s)" (practice/track build) | `question_knowledge_mapping` | reverse index `(knowledgeNodeId)` + PK |
| H3 | **Exact dedup** at ingestion | `questions`, `question_versions` | btree `questions(normalizedTextHash)`, `question_versions(normalizedTextHash)` |
| H4 | **Near-dup** similarity at ingestion | `question_versions` | GIN trigram `idx_question_versions_text_trgm` (operational) |
| H5 | **Full-text search** of questions | `question_versions` | GIN `idx_question_versions_search` on generated `search_vector` (operational) |
| H6 | **Mock-test leaderboard** (rank/percentile) | `test_sessions`, `results` | `test_sessions(mockTestId)`, `results(testSessionId)` unique; ranking computed per cohort |
| H7 | **Revision due list** for a user | `revision_queue` | composite `(userId, dueAt)` |
| H8 | **Mastery lookup / upsert** | `student_mastery` | `@@unique(userId,knowledgeNodeId)` |
| H9 | **Event ingestion & time-range analytics** | `events` | `(userId,occurredAt)`, `(type,occurredAt)` + monthly partition pruning (operational) |
| H10 | **Outbox relay poll** | `outbox_events` | `(status, availableAt)` |
| H11 | **Auth: refresh rotation / reuse detection** | `refresh_tokens` | `tokenHash` unique, `(userId)`, `(familyId)` |
| H12 | **Login by email (per tenant)** | `users` | `@@unique(organizationId,email)`, `(email)` |
| H13 | **Payment idempotency / provider reconcile** | `payments` | `idempotencyKey` unique, `providerPaymentId` unique |

\* `questions(calculatedDifficulty)` is added when the difficulty engine lands (Phase 12). The current index set already covers selection by mapping + status.

## 2. Declared index inventory (highlights)

- **Every mapping table** carries its composite PK *and* a reverse single-column index (e.g. `question_knowledge_mapping`: PK `(questionId,knowledgeNodeId)` + `@@index(knowledgeNodeId)`), so traversal is fast in both directions.
- **Tenancy:** `@@index(organizationId)` on every org-scoped table (partition-friendly + RLS-friendly).
- **Lifecycle filters:** `questions(status)`, plus `normalizedTextHash` for dedup.
- **Uniqueness as a constraint *and* an index:** `*.code`, `users(orgId,email)`, `tags(name|slug)`, `permissions(key)`, `plan_prices(planId,interval,currency)`, `revision_queue(userId,questionId)`, `bookmarks(userId,questionId)`, `track_progress(userId,trackModuleId)`.

## 3. Composite-index ordering rationale

- `revision_queue(userId, dueAt)` — equality on `userId` then range scan on `dueAt` ("my items due now"). Column order matters: most-selective equality first.
- `events(type, occurredAt)` and `(userId, occurredAt)` — equality + time range; pairs with partition pruning so scans touch only relevant months.
- `outbox_events(status, availableAt)` — partial-by-value scan of `PENDING` rows ordered by availability (relay worker `WHERE status='PENDING' AND availableAt<=now() ORDER BY availableAt`).

## 4. Operational objects (apply after `migrate deploy`)

These would be flagged as **drift** by `prisma migrate dev` (extra index / generated column / partitioned table), so they are intentionally kept out of Prisma's migration history and applied operationally:

```bash
pnpm --filter @pharmacy/api exec prisma db execute \
  --file prisma/sql/search_and_partitioning.sql --schema prisma/schema.prisma
```

Contents:
1. **`idx_question_versions_text_trgm`** — GIN trigram for near-duplicate detection (`pg_trgm`).
2. **`search_vector`** generated column + GIN — PostgreSQL full-text search (weighted: stem A, explanation B). Phase-2 search per the architecture; Elasticsearch is the Phase-2(later) swap behind the `SearchPort`.
3. **`events` monthly partitioning** — `create_events_partition(month)` helper + a commented one-time conversion block (events is empty at bootstrap). Schedule partition creation a few months ahead via a BullMQ repeatable job (preferred) or `pg_cron`; detach + archive cold partitions to S3/Parquet.

### Workflow rule
Use **`prisma migrate deploy`** (CI/prod) + the operational SQL. Reserve **`prisma migrate dev`** for evolving the Prisma-managed surface in a *fresh* dev DB without the operational objects, to avoid false-positive drift. This separation keeps the Prisma baseline byte-for-byte aligned with `schema.prisma`.

## 5. Planned (later phases, noted here so indexing stays intentional)

- **Covering indexes / `INCLUDE`** on the question-selection path once query shapes are profiled (Phase 5/10).
- **Materialized "question pool" projections** per exam profile for blueprint assembly at scale (§P-1).
- **Partial indexes** (e.g. `WHERE deletedAt IS NULL`, `WHERE status='PUBLISHED'`) once row volumes justify them.
- **BRIN** on `events(occurredAt)` within large partitions as an alternative to btree for append-only time data.
