# DATABASE_ARCHITECTURE.md — Phase 2

> Source of truth: the architecture `.docx` + `ARCHITECTURE_REVIEW.md` (approved decisions §7.1).
> Schema: [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma) — **62 tables, 20 enums**, validated (`prisma generate` + `migrate diff` clean).

---

## 1. Principles

1. **Golden Rule.** `questions` hold no FK to exam/curriculum/subject. Every such link is a mapping table (`question_*_mapping`). A question exists once.
2. **Knowledge is a graph**, not a tree — `knowledge_nodes` + `knowledge_edges` (DAG for hierarchy, enforced by trigger).
3. **Immutability where it matters.** Question edits create new `question_versions`; assessment attempts freeze a JSONB `test_question_snapshots`; `audit_logs` are append-only.
4. **Derived data is written, not computed-on-read.** `student_mastery`, `*_metrics` are aggregates updated by workers from the `events` stream.
5. **Conventions.** UUID v7 PKs · `Timestamptz(6)` · camelCase columns / snake_case tables (`@@map`) · money = integer minor units + currency · JSONB for typed-but-flexible specs · `deletedAt` soft-delete where status doesn't already model lifecycle.

## 2. Multi-tenancy (§7-A)

`organizationId uuid NULL` is a **soft column** (indexed, no Prisma relation) on tenant-scoped tables: `users, student_profiles, practice_sessions, test_sessions, mock_tests, subscriptions, payments, notifications, audit_logs, events`. Content (questions, knowledge, exams, curriculums, tracks, plans) is **global/shared** by design — that's the whole point of the Golden Rule.

- Keeping it a soft column decouples global content from identity and avoids a painful retrofit later.
- **RLS scaffolding** (migration `20260602090100`) enables row-level security with a permissive policy keyed to `app.current_org` GUC. Single-tenant today (GUC unset ⇒ allow all); production connects as a non-owner role and `SET LOCAL app.current_org` per request to enforce isolation.

## 3. Domains & key tables

### Identity
`organizations` · `users` (status enum, soft-delete, `@@unique(orgId,email)`) · `roles` · `permissions` (`resource:action`) · `role_permissions` (the join the doc was missing, §SEC-1) · `user_roles`. Auth lifecycle: `refresh_tokens` (hashed, `familyId` for rotation + reuse revocation, §SEC-3), `email_verification_tokens`, `password_reset_tokens`.

### Knowledge
`knowledge_nodes` (free-form `type`, soft-delete) · `knowledge_edges` (`relationshipType` enum; `@@unique(parent,child,type)`; self-loop CHECK; **DAG cycle-prevention trigger** for hierarchical types).

### Question (+ Mapping)
`questions` (stable identity: code, type, status, author/calculated difficulty, `language`, `currentVersionId`, denormalized `normalizedTextHash`; **no** exam/curriculum FKs) · `question_versions` (text/explanation/`answerSpec` JSONB/`normalizedTextHash`; `@@unique(questionId,versionNumber)`) · `question_options` · `question_media` · `tags`. **Mappings:** `question_knowledge_mapping`, `question_exam_mapping`, `question_curriculum_mapping`, `question_track_mapping`, `question_tag_mapping` — all composite-PK joins with the reverse index for traversal.

`answerSpec` (JSONB) carries the typed correct answer per `QuestionType` (numeric tolerance, matching pairs, multi-correct sets, assertion-reason) — drives the strategy scoring engine (§L-1, built in Phase 5/10).

### Curriculum
`curriculums` · `curriculum_nodes` (self-referential tree via `parentId`) · `curriculum_knowledge_mapping` (tree node ⇄ shared knowledge).

### Exam
`exam_profiles` · `exam_blueprints` (totals, duration) · `exam_blueprint_items` (label, `weightPercent` 0–100 CHECK, `questionCount`, `difficultyMix` JSONB, optional knowledge node) · `exam_knowledge_mapping`.

### Learning
`learning_tracks` (optional exam link) · `track_modules` · `track_knowledge_mapping` · `track_progress` (`@@unique(userId,moduleId)`).

### Student
`student_profiles` (1:1 user) · `student_goals` (→ exam) · `student_preferences` (1:1 JSONB).

### Practice (untimed)
`practice_sessions` · `practice_session_questions` · `practice_answers`.

### Assessment (timed) — §7-B
`mock_tests` (**shared** definition: FIXED set or BLUEPRINT-generated; opens/closes window; the ranking cohort) · `mock_test_questions` (marks, negative marks) · `test_sessions` (per-user attempt; `mockTestId` **nullable** ⇒ ad-hoc exam with no cohort ranking) · `test_question_snapshots` (immutable JSONB freeze; scoring never reads the live question) · `test_answers` · `results` (score/accuracy/rank/percentile; CHECK ranges).

### Revision
`revision_queue` (`source` enum, `priority`, `dueAt`, `@@unique(userId,questionId)`, `@@index(userId,dueAt)`) · `revision_history`.

### Bookmark
`bookmarks` (`@@unique(userId,questionId)`).

### Analytics
`events` (append event stream; soft user/org columns; partitioned operationally, §S-1) · `student_mastery` (per node; `@@unique(userId,nodeId)`) · `topic_metrics` (per node) · `question_metrics` (per question; feeds `calculatedDifficulty`).

### Recommendation
`recommendation_rules` (JSONB `definition`, priority) · `recommendation_history`.

### Commerce — §7-C
`plans` · `plan_prices` (`billingInterval`, `amountMinor` minor units, currency; `@@unique(plan,interval,currency)`) · `features` · `plan_features` (limits) · `subscriptions` (provider-agnostic; `provider` enum default RAZORPAY) · `payments` (`providerPaymentId` unique, **`idempotencyKey` unique**, `rawPayload`; amount CHECK).

### Notification
`notifications` (`channel`/`status` enums, template + JSONB payload).

### Administration
`audit_logs` (append-only via trigger; `actorUserId` soft ref so user deletion never erases the trail; before/after JSONB).

### Infrastructure
`outbox_events` (transactional outbox §M-1: domain writes enqueue in the same TX; relay worker publishes to BullMQ → exactly-once-ish events/notifications).

## 4. Integrity & constraints

- **FKs + `onDelete: Cascade`** on tightly-owned children (versions→options/media, sessions→answers/snapshots, role/user joins, plan children, all `question_*_mapping`).
- **CHECK constraints** (migration `…_advanced_constraints`): weight 0–100, non-negative counts/amounts, accuracy/percentile ranges, version number ≥ 1, no self-loop edges.
- **Triggers:** knowledge-edge DAG guard; audit-log append-only.
- **Soft refs (no FK)** for cross-boundary links (content `createdById`, audit `actorUserId`, `events.userId/organizationId`) — deliberate decoupling.

## 5. Versioning & snapshots

- Editing a published question creates a new `question_versions` row; `questions.currentVersionId` points at the live one. Historical attempts remain correct because…
- …each `test_question_snapshots` row stores a full immutable JSONB copy (stem, options, media refs, `answerSpec`, marks). Grading/regrading operates solely on snapshots.

## 6. Migration strategy

| Artifact | Purpose |
|---|---|
| `migrations/20260602090000_init` | Prisma-managed baseline (all 62 tables, 20 enums). Matches schema exactly ⇒ zero drift. |
| `migrations/20260602090100_advanced_constraints` | CHECKs, triggers, RLS, extensions — invisible to Prisma drift detection. |
| `sql/search_and_partitioning.sql` | Operational objects (trigram, FTS generated column, event partitioning) applied post-`deploy` via `prisma db execute`. Kept out of Prisma history because they'd otherwise show as drift. See `DATABASE_INDEXING.md`. |

**Workflow.** Use `prisma migrate deploy` (CI/prod) then apply the operational SQL. Reserve `prisma migrate dev` for evolving the Prisma-managed surface; in DBs carrying the operational objects, prefer the diff/deploy flow to avoid false drift.

```bash
pnpm db:migrate:deploy
pnpm --filter @pharmacy/api exec prisma db execute --file prisma/sql/search_and_partitioning.sql --schema prisma/schema.prisma
pnpm db:seed
```

## 7. Data lifecycle

- **Soft-delete** (`deletedAt`) on content (`users, questions, knowledge_nodes, curriculums, exam_profiles, learning_tracks`); repositories filter it out by default.
- **Events** retained hot for N months in partitions; cold partitions archived to S3 (Parquet) and detached.
- **Tokens** (refresh/verification/reset) pruned by a scheduled job once expired.
- **PII** (`users.mobile`, email): access audited; column-level encryption + erasure/export covered in Phase 19.

## 8. Verification (this phase, on the build machine)

`prisma format` ✅ · `prisma generate` ✅ (client v6.19.3) · `prisma migrate diff --from-empty` ✅ → 62 tables / 20 enums / 1434 lines. Applying migrations to a live DB requires Postgres (`pnpm docker:up`) — not available on the build machine; the generated SQL is committed and ready for `migrate deploy`.
