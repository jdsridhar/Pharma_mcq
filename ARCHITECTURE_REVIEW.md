# ARCHITECTURE_REVIEW.md — Phase 0: Architecture Validation

> **Source of truth:** `Pharmacy MCQ Platform - Enterprise Architecture..docx` (v2.0)
> **Reviewers (roles):** Principal Architect · Senior Backend · Database Architect · Security Engineer · DevOps · QA · Tech Lead
> **Date:** 2026-06-02
> **Status:** ✅ Complete — all 3 architecture-changing decisions APPROVED 2026-06-02 (see §7.1 Decision Log)

---

## 1. Executive Summary

The v2.0 architecture is **fundamentally sound** and unusually well-conceived for an MCQ platform. Its central insight — the **Golden Rule: "A question exists exactly once; everything else is a mapping"** — is the correct foundation and directly eliminates the duplication, hard-coded-syllabus, and content-maintenance failures that sink most exam platforms. The domain decomposition is clean and the use of a **knowledge graph** (instead of a rigid Subject→Chapter→Topic tree), **immutable assessment snapshots**, and **question versioning** are senior-grade decisions we fully endorse and will preserve.

The architecture is **conceptually complete but implementation-underspecified**. It is a *domain map*, not yet a *buildable spec*. This review converts it into one. We found:

- **0 fatal flaws** (nothing requires re-architecting the core).
- **3 architecture-changing gaps** that need your decision before Phase 2 (DB design): multi-tenancy model, mock-test/ranking model, payment provider. See §7.
- **18 additive improvements** that fill gaps without contradicting the design — applied automatically per your process rule #6 (see §6).
- Several **specification gaps** (non-MCQ answer storage, dedup mechanism, RBAC join table) that *must* be resolved to honour the document's own stated goals.

**Verdict:** Approve the core. Resolve §7. Proceed to Phase 1 (foundation) in parallel — it does not depend on the §7 answers.

---

## 2. What We Understood (confirmation of intent)

| Concept | Our reading | Confidence |
|---|---|---|
| Golden Rule | Questions are pure content; curriculum/exam/track/tag/analytics relationships are all join tables. No FK from `questions` to exam/subject. | High |
| Knowledge model | `knowledge_nodes` + `knowledge_edges` = a directed graph (DAG for hierarchy), **not** a fixed tree. | High |
| Curriculum vs Knowledge | `curriculum_nodes` is a per-curriculum tree; it *maps* to shared `knowledge_nodes` via `curriculum_knowledge_mapping`. | High |
| Assessment integrity | `test_question_snapshots` freezes the exact question version at attempt time; scoring never reads live questions. | High |
| Analytics | Event-sourced: every action emits an event; `student_mastery` / `*_metrics` are derived aggregates. | High |
| Engines | Difficulty, Revision (explicit formula), Recommendation are computed services over the above. | Medium (formulas need productionising) |

If any row above is wrong, flag it — everything downstream inherits these assumptions.

---

## 3. Strengths (preserve these — do not "simplify" them)

- **S-A.** Content/mapping separation (Golden Rule) — the single best decision in the document.
- **S-B.** Knowledge graph over fixed taxonomy — enables cross-exam reuse (Aspirin appears everywhere, stored once).
- **S-C.** Immutable snapshots for assessments — correct for fairness, audit, and post-hoc re-grading.
- **S-D.** First-class question versioning — enables safe edits without corrupting historical attempts.
- **S-E.** Revision treated as a first-class domain — genuinely differentiating; most platforms bolt this on.
- **S-F.** Event store as the analytics spine — future-proofs AI/ML features.
- **S-G.** Practice (untimed) vs Assessment (timed) cleanly separated.

---

## 4. Findings (prioritised)

Severity: 🔴 Critical (blocks correctness/security) · 🟠 High · 🟡 Medium · ⚪ Low
ID prefixes: **L** logical/domain · **S** scalability · **SEC** security · **P** performance · **M** missing component

### 4.1 Logical / Domain-Model

| ID | Sev | Finding | Impact | Recommendation |
|---|---|---|---|---|
| L-1 | 🔴 | **Non-MCQ answer storage undefined.** `question_type` exists, but `question_options(is_correct)` only models single/multi-choice. Numeric, matching, assertion-reason, and multi-correct types have no answer representation. | Scoring engine can't evaluate them; "multi-exam ready" is compromised (GPAT/NIPER use numeric & A-R). | Add a typed `answer_spec` (JSONB) on the question version + a strategy-pattern scoring engine keyed by `question_type`. Options remain for choice types. (Auto: M-applied.) |
| L-2 | 🔴 | **No duplicate-detection mechanism.** The doc's #1 goal is "no duplicate questions" but provides no enforcement. | The platform's headline guarantee is unenforceable; authors *will* paste near-duplicates. | Add `normalized_text_hash` (exact) + `pg_trgm` similarity check at ingestion; surface "possible duplicate" in review workflow. (Auto.) |
| L-3 | 🟠 | **Knowledge-graph cycles unbounded.** `knowledge_edges(parent,child,relationship_type)` allows cycles, breaking tree traversals/mastery rollups. | Infinite loops, incorrect mastery aggregation. | Constrain hierarchical edge types (IS_A, PART_OF) to a DAG with cycle-check on insert; allow associative types (RELATED_TO) to be cyclic but exclude from rollups. (Auto.) |
| L-4 | 🟠 | **Ranking requires a cohort the model doesn't define.** `results.rank/percentile` only make sense relative to a shared, fixed test taken by many. `test_sessions` reads as ad-hoc/per-user. | Rank/percentile are meaningless or non-comparable. | **Architecture decision — see §7 Decision B.** Recommend a `mock_tests` definition entity separate from per-user `test_sessions`. |
| L-5 | 🟡 | **`calculated_difficulty` recompute trigger unspecified.** Stored field, no cadence/owner. | Drifts stale; difficulty engine is decorative. | BullMQ scheduled job recomputes from `question_metrics` on a threshold of new answers. (Auto.) |
| L-6 | 🟡 | **No language/locale on questions.** | Future multi-language exams need reauthoring. | Add nullable `language` (default `en`) on question version now. (Auto — cheap insurance.) |

### 4.2 Scalability

| ID | Sev | Finding | Impact | Recommendation |
|---|---|---|---|---|
| S-1 | 🟠 | **`events` table grows unbounded.** "Every action → event" with no partitioning/retention. | Table bloat, slow writes/vacuum, expensive analytics scans. | Declarative **range partitioning by month**; hot window in PG, cold partitions archived to S3 (Parquet). (Auto.) |
| S-2 | 🟠 | **Aggregates implied to recompute on read.** `student_mastery`, `topic_metrics`, `question_metrics`. | Read-path latency, DB CPU spikes. | **Event-driven incremental updates** via BullMQ workers; aggregates are write-time, not read-time. (Auto.) |
| S-3 | 🟡 | **No read-replica / pooling strategy.** | Connection exhaustion under load (serverless/NestJS workers). | PgBouncer (transaction pooling) + optional read replica for analytics reads, behind a repository abstraction. (Auto.) |
| S-4 | 🟡 | **Search swap (PG FTS → Elasticsearch) not abstracted.** | Phase-2 swap becomes invasive. | Define a `SearchPort` interface; PG-FTS adapter now, ES adapter later. (Auto.) |

### 4.3 Security

| ID | Sev | Finding | Impact | Recommendation |
|---|---|---|---|---|
| SEC-1 | 🔴 | **RBAC join is incomplete.** `roles`, `permissions`, `user_roles` exist but **no `role_permissions`**. Roles can't actually carry permissions. | RBAC is non-functional as drawn. | Add `role_permissions`; permissions are `resource:action` (e.g., `question:approve`). (Auto — filling an obvious gap, not changing intent.) |
| SEC-2 | 🟠 | **No row/resource-level authorization.** E.g., an Author editing only *their* drafts; Reviewer scope. | Privilege escalation / horizontal access. | Policy/guard layer (CASL-style abilities) on top of RBAC. (Auto.) |
| SEC-3 | 🟠 | **Auth lifecycle underspecified.** No refresh-token rotation/reuse-detection, email verification, password reset, lockout, MFA hooks. | Token theft, account takeover, brute force. | Refresh-token **family rotation w/ reuse revocation**; httpOnly+Secure cookies; verification & reset token tables; lockout via Redis; MFA-ready. (Auto.) |
| SEC-4 | 🟠 | **Payments/PCI & webhook integrity.** `payments` table with no provider/idempotency/webhook-signature design. | Double-charges, replay, PCI exposure if card data stored. | Never store PAN; store provider tokens only; signed webhooks + **idempotency keys**. Provider = **§7 Decision C**. |
| SEC-5 | 🟡 | **PII at rest.** `email`, `mobile` unencrypted; no deletion/GDPR/DPDP path. | Compliance & breach blast radius. | Column-level encryption for `mobile`; data-subject delete/export; PII access audited. (Auto.) |
| SEC-6 | 🟡 | **Audit log immutability.** `audit_logs` exists but mutability/tamper-evidence unstated. | Audit can be altered. | Append-only, no UPDATE/DELETE grant; optional hash-chain. (Auto.) |

### 4.4 Performance

| ID | Sev | Finding | Impact | Recommendation |
|---|---|---|---|---|
| P-1 | 🟠 | **Hot path = question selection across mapping tables** ("N questions for exam X, blueprint weighting, difficulty band, excluding seen"). M:N joins. | Slow session/test generation at scale. | Covering composite indexes on mapping tables + materialised "question pool" projections per exam; documented in DATABASE_INDEXING.md. (Auto.) |
| P-2 | 🟡 | **Snapshot shape undecided** (normalised vs JSONB). | Either join-heavy reads or rigid schema. | **Immutable JSONB** snapshot (question+options+media+answer_spec) per attempt; small, self-contained, fast. (Auto.) |
| P-3 | 🟡 | **N+1 on question rendering** (question→options→media→mappings). | Latency under load. | Repository-level batched/eager loading; cache published questions in Redis. (Auto.) |

### 4.5 Missing Cross-Cutting Components

| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| M-1 | 🟠 | **Transactional outbox** absent. DB write + queue publish = dual-write inconsistency (events, notifications, payments). | `outbox` table + relay worker → exactly-once-ish publishing. (Auto.) |
| M-2 | 🟠 | **Bulk question ingestion pipeline** absent (authors upload thousands). | CSV/JSON import via BullMQ with validation + L-2 dedup gate + staging→review. (Auto.) |
| M-3 | 🟡 | **Observability** (structured logs, metrics, tracing, health/readiness). | OpenTelemetry + `/health` `/ready`; pino logs; Prometheus metrics. (Auto.) |
| M-4 | 🟡 | **API versioning & contract.** | `/api/v1` prefix; OpenAPI/Swagger generated from DTOs. (Auto.) |
| M-5 | 🟡 | **Media upload pipeline.** | S3 presigned PUT, MIME/size validation, optional AV scan, CDN URLs. (Auto.) |
| M-6 | ⚪ | **Soft-delete/retention consistency.** | `deleted_at` where status doesn't already cover it; consistent across entities. (Auto.) |
| M-7 | ⚪ | **Seed & migration discipline.** | Prisma migrations checked in; idempotent seeders for roles/permissions/plans. (Auto.) |
| M-8 | 🔴 | **Multi-tenancy** — goal states "Multi Tenant Ready (future)" but no tenant concept exists. Retrofitting `tenant_id` later is the most expensive migration we could defer. | **Architecture decision — §7 Decision A.** |

---

## 5. Risk Register (top items)

| Risk | Likelihood | Impact | Mitigation | Owner finding |
|---|---|---|---|---|
| Duplicate questions slip in, breaking the headline promise | High | High | Dedup gate at ingestion | L-2, M-2 |
| Painful tenant retrofit | Med | High | Decide tenancy now | M-8 / §7-A |
| Meaningless rankings erode trust | Med | High | Define mock cohort model | L-4 / §7-B |
| Event table degrades DB | Med | High | Partition + archive | S-1 |
| RBAC ineffective in prod | High | High | role_permissions + policies | SEC-1/2 |
| Payment double-charge/replay | Med | High | Idempotency + signed webhooks | SEC-4 / §7-C |

---

## 6. Improvements Applied Automatically (no architecture change — proceeding per process rule #6)

These are **additive and non-breaking**; they fill gaps or harden the design without contradicting any stated decision. They will be reflected in Phase 2 (DATABASE_ARCHITECTURE.md) and the relevant domain phases.

1. `role_permissions` join + `resource:action` permission model (SEC-1).
2. Policy/ability authorization layer over RBAC (SEC-2).
3. Refresh-token family rotation + reuse revocation; email-verification & password-reset token tables; Redis lockout; MFA-ready (SEC-3).
4. `answer_spec` (JSONB) on question version + strategy-pattern scoring engine for non-MCQ types (L-1).
5. `normalized_text_hash` + `pg_trgm` similarity dedup at ingestion (L-2).
6. DAG constraint + cycle check on hierarchical knowledge edges (L-3).
7. Scheduled difficulty/metrics recompute jobs (L-5, S-2).
8. `language` column on question version, default `en` (L-6).
9. Monthly range-partitioned `events` + S3 cold archival (S-1).
10. Event-driven incremental aggregates via BullMQ (S-2).
11. PgBouncer pooling + read-replica-ready repositories (S-3).
12. `SearchPort` abstraction (PG-FTS now, ES later) (S-4).
13. Covering composite indexes + per-exam question-pool projections (P-1).
14. Immutable JSONB assessment snapshots (P-2).
15. Transactional **outbox** + relay worker (M-1).
16. Bulk ingestion pipeline with validation + dedup + staging→review (M-2).
17. Observability (OTel, pino, health/ready, Prometheus) (M-3).
18. `/api/v1` + generated OpenAPI; S3 presigned media pipeline; consistent `deleted_at`; checked-in migrations & idempotent seeders (M-4..M-7).

**Also adopted as conventions (implementation-level, not architecture):**
- **Primary keys: UUID v7** (time-ordered) for index locality + distribution-friendliness.
- `created_at/updated_at` on all tables; `created_by/updated_by` on content entities.
- Status fields as Postgres enums / checked lookups.
- All money in integer minor units + currency code (never floats).
- Zod at HTTP/queue boundaries; Prisma types internally.

---

## 7. Decisions Requiring Owner Approval (architecture-changing — process rule #5)

These change the schema/domain model and depend on **business context we cannot infer**. Each has a strong recommended default; if you prefer, reply "use recommended defaults" and we proceed. **Phase 1 (foundation) does not depend on these and will start now.**

**Decision A — Multi-tenancy model.** Goal says "Multi Tenant Ready (future)."
- ✅ *Recommended:* Add nullable `organization_id` to tenant-scoped tables now + design for Postgres Row-Level Security; run single-tenant until activated. Cheap now, avoids the worst migration later.
- *Alt 1:* Defer entirely (fastest now, expensive/risky retrofit).
- *Alt 2:* Schema-per-tenant (strong isolation, heavier ops).

**Decision B — Mock-test & ranking model.** Needed to make `rank/percentile` meaningful.
- ✅ *Recommended:* Introduce `mock_tests` (shared, published, fixed/blueprint-defined definitions) separate from `test_sessions` (per-user attempts). Ranking computed per mock cohort.
- *Alt 1:* Ad-hoc generated tests only; percentile vs a rolling population (simpler, weaker comparability).
- *Alt 2:* Both (shared mocks + ad-hoc; ranking only for shared).

**Decision C — Payment provider.** Indian exam focus suggests local rails.
- ✅ *Recommended:* Provider-agnostic `PaymentGateway` port + **Razorpay** adapter first; Stripe later. Signed webhooks + idempotency built in.
- *Alt 1:* Stripe first.
- *Alt 2:* Port + sandbox/mock adapter only; wire a real provider later.

---

### 7.1 Decision Log — RESOLVED (2026-06-02, all recommended defaults approved)

| Decision | Choice | Implementation impact (carried into Phase 2+) |
|---|---|---|
| **A. Multi-tenancy** | Org-ready columns + RLS now; single-tenant runtime | `organizations` table; nullable `organization_id UUID` on tenant-scoped tables; RLS policies authored but permissive until activated; default org seeded. |
| **B. Mock / ranking** | Shared `mock_tests` + per-user `test_sessions` | New `mock_tests` (blueprint-or-fixed question set); `test_sessions.mock_test_id` nullable (null = ad-hoc practice exam); rank/percentile computed per mock cohort. |
| **C. Payments** | Provider-agnostic port + Razorpay first | `PaymentGateway` port + `RazorpayAdapter`; signed-webhook verification; idempotency keys; money as integer minor units + currency code. |

## 8. Phase 0 Exit Criteria

- [x] Entire architecture document read and understood (§2).
- [x] Strengths catalogued (§3).
- [x] Logical, scalability, security, performance flaws + missing components identified (§4).
- [x] Improvements proposed; additive ones auto-adopted (§6).
- [x] Architecture-changing decisions isolated for approval (§7).
- [x] Risk register established (§5).
- [x] Owner sign-off on §7 (A, B, C) — all recommended defaults approved (2026-06-02).

**Next:** Phase 1 — Project Foundation (monorepo, Docker, Prisma, Postgres, Redis, env). Proceeds immediately; Phase 2 (DB design) starts once §7 is resolved.
