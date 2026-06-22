# TODO.md — Master Phase Tracker

Legend: `[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked

---

- [x] **Phase 0 — Architecture Validation** → `ARCHITECTURE_REVIEW.md`
  - [x] Read architecture document (source of truth)
  - [x] Identify logical / scalability / security / performance flaws
  - [x] Identify missing components
  - [x] Propose improvements (auto-apply additive; isolate architecture-changing)
  - [x] Owner sign-off on Decisions A/B/C (§7) — all recommended defaults approved

- [x] **Phase 1 — Project Foundation** → `SYSTEM_SETUP.md` *(verified: install/build/test/typecheck green)*
  - [x] Monorepo (pnpm workspaces + turborepo): `apps/api`, `apps/web`, `packages/*`
  - [x] Shared packages: `config`, `contracts` (Zod), `eslint-config`
  - [x] Backend skeleton (NestJS + TS strict) — config/infra/health, Zod pipe, error filter, pino, swagger
  - [x] Frontend skeleton (Next.js + TS + Tailwind + React Query + Zustand)
  - [x] Prisma + Postgres + Redis wiring (PrismaService, RedisService, health indicators)
  - [x] Docker Compose (postgres, redis, minio/S3, mailpit, api, web) + Dockerfiles *(authored; run pending Docker)*
  - [x] Env config + validation (@pharmacy/config Zod); scripts; health endpoints
  - [ ] ↪ run-time validation pending a Docker host: `docker compose up`, initial `prisma migrate`, `next build`

- [x] **Phase 2 — Database Design** → `DATABASE_ARCHITECTURE.md`, `DATABASE_ERD.md`, `DATABASE_INDEXING.md` *(schema valid; 62 tables/20 enums; migrations generated)*
  - [x] Full Prisma schema (all domains, Golden Rule, §7 decisions, conventions)
  - [x] Baseline migration (`migrate diff`) + advanced-constraints migration (CHECK/RLS/triggers/append-only audit)
  - [x] Operational SQL (trigram dedup, FTS, event partitioning) + env wiring (`dotenv-cli`)
  - [ ] ↪ apply to a live DB (Docker host): `migrate deploy`, `db:sql`, `db:seed`
- [x] **Phase 3 — Identity Domain** → `IDENTITY_DOMAIN.md` *(JWT+refresh rotation, RBAC, account flows, seeders; 22 unit tests green)* (Users, Roles, Permissions, role_permissions, JWT, refresh rotation, RBAC, policies)
- [x] **Phase 4 — Knowledge Domain** → `KNOWLEDGE_DOMAIN.md` *(node/edge CRUD, recursive-CTE traversal, DAG cycle guard, RBAC; 30 unit tests green)* (nodes, edges/DAG, graph APIs)
- [x] **Phase 5 — Question Domain** → `QUESTION_DOMAIN.md` *(versioning, typed answerSpec, review workflow, dedup, knowledge+tag mappings, search; 39 unit tests green)* (questions, versions, options, media, answer_spec, mapping, dedup, search)
- [x] **Phase 6 — Curriculum Domain** → `CURRICULUM_DOMAIN.md` *(curriculum + node tree, cycle/leaf-delete guards, curriculum↔knowledge + question↔curriculum mappings; 48 unit tests green)*
- [x] **Phase 7 — Exam Domain** → `EXAM_DOMAIN.md` *(profiles, blueprints + weighted items w/ 100% budget guard, exam↔knowledge + question↔exam mappings; 57 unit tests green)* (exams, blueprints, mapping)
- [x] **Phase 8 — Learning Domain** → `LEARNING_DOMAIN.md` *(tracks + modules, track↔knowledge, per-student TrackProgress, question↔track mapping; 64 unit tests green)*
- [x] **Phase 9 — Practice Domain** → `PRACTICE_DOMAIN.md` *(reusable AnswerEvaluator, pool selection, no-leak serving, immediate scoring, session summary, BullMQ analytics; 76 unit tests green)*
- [x] **Phase 10 — Assessment Domain** → `ASSESSMENT_DOMAIN.md` *(mock tests FIXED/BLUEPRINT, immutable snapshots, scoreAttempt w/ negative marking, live ranking/percentile, ad-hoc tests; 83 unit tests green)* (mock_tests*, sessions, snapshots, evaluation, ranking)
- [x] **Phase 11 — Revision Domain** → `REVISION_DOMAIN.md` *(spaced-repetition queue, pure scheduler, review+history, snooze, generate-from-wrong; 93 unit tests green)* (queue, scheduler, analytics)
- [x] **Phase 12 — Analytics Domain** → `ANALYTICS_DOMAIN.md` *(pure mastery engine, recompute sync+queue, student_mastery/topic metrics, dashboards; 99 unit tests green)* (event store, mastery, metrics)
- [x] **Phase 13 — Recommendation Domain** → `RECOMMENDATION_DOMAIN.md` *(weak-area detection + study planner (pure), rule-driven feed + history, admin rule CRUD; 107 unit tests green)*
- [x] **Phase 14 — Commerce Domain** → `COMMERCE_DOMAIN.md` *(plan catalog, provider-agnostic payments [Manual+Razorpay], subscriptions + signature-verified webhook, entitlements; 116 unit tests green)* (plans, features, subscriptions, payments) *(needs §7-C)*
- [x] **Phase 15 — Notification Domain** → `NOTIFICATION_DOMAIN.md` *(in-app feed + channel ports/adapters + template registry + BullMQ worker; Identity emails routed through it; 123 unit tests green)* (email, SMS, push)
- [x] **Phase 16 — Admin Panel** → `ADMIN_DOMAIN.md` *(user/role admin, review queue, append-only audit logging + interceptor; 128 unit tests green) — all backend domains complete* (content mgmt, review workflow, audit)
- [x] **Phase 17 — Frontend** → `FRONTEND_ARCHITECTURE.md` *(typed API client w/ silent 401 refresh, Zustand auth + bootstrap, TanStack Query, UI kit, role-aware shell; student portal — dashboard/practice player [6 types]/timed mock runner+ranking/revision/analytics/plans — + admin shell — review queue/users+roles/audit; **15 routes; web build ✅ typecheck ✅ lint ✅**)* (student + admin portals, a11y)
- [x] **Phase 18 — Testing** → `TESTING_STRATEGY.md` *(codified test pyramid: pure-engine + service units, e2e wiring, web units; added web Jest+ts-jest harness w/ **12 smoke tests** for api-client silent-refresh/retry + auth store; documented run commands, coverage targets, CI matrix, gaps. **Verified: API 128/32 ✅ · web 12/2 ✅ · typecheck+lint ✅**; 15 API e2e suites await live PG+Redis)* (unit, integration, e2e)
- [x] **Phase 19 — Security** → `SECURITY_ARCHITECTURE.md` *(OWASP Top-10 mapped to implemented controls; documented authN [JWT+rotating hashed refresh family+reuse detection, bcrypt, anti-enumeration/timing], RBAC [3 global guards+@Public, PolicyService, no-answer-leak], Zod validation, Helmet/CORS, secrets/encryption, append-only audit, HMAC webhooks. **Implemented Redis-backed `ThrottlerGuard`** [prod-gated, fail-open, IP+route, `@Throttle`/`@SkipThrottle`] global + `/auth/*` 10/60 + health skip; **+7 tests**. **Verified: API build ✅ · 135/33 ✅ · lint ✅**)* (OWASP, rate limiting, audit, encryption)
- [x] **Phase 20 — Deployment** → `DEPLOYMENT_GUIDE.md` *(hardened both multi-stage Dockerfiles [non-root `node` user + `HEALTHCHECK`; web standalone PORT/HOSTNAME]; added `.github/workflows/ci.yml` [quality + security/`pnpm audit` + e2e w/ PG16+Redis7 + docker image build jobs]; added `docker-compose.prod.yml` [one-shot `db-setup` migrate→sql→seed via `service_completed_successfully`, no exposed datastore ports]; full guide: topology, env/secrets, DB lifecycle, CI/CD, scaling, observability, deploy hardening, rollback runbook, release checklist. **Verified: pnpm build ✅ · lint ✅ · typecheck ✅ · test 147 ✅**)* (Docker, CI/CD, prod config)

---

## ✅ PROJECT COMPLETE — all 20 phases delivered (2026-06-06)
Foundation → DB (62 tables/20 enums) → 14 backend domains → Next.js web client → testing → security → deployment. **147 unit tests green** (API 135 + web 12); 15 API e2e suites run in CI. Docs: ARCHITECTURE_REVIEW, SYSTEM_SETUP, 14× *_DOMAIN, 3× DB docs, FRONTEND_ARCHITECTURE, TESTING_STRATEGY, SECURITY_ARCHITECTURE, DEPLOYMENT_GUIDE.

---

## 🏢 Post-launch initiative — Multi-Tenancy (Institutional plans)
Isolated institution tenants alongside Individual (B2C) plans. Model + helper in `CURRENT_STATE.md` → "Multi-Tenancy (MT)".
- [x] **MT-1 — Org foundation + scoped admin** *(Organization table; Super-Admin org CRUD; org-scoped admin user mgmt; global login; web `admin/organizations`)*
- [x] **MT-2 — Content org-isolation** *(`organizationId` on questions/mock_tests/curriculums/exam_profiles/learning_tracks; actor-threaded read/manage guards + child-via-parent; practice pool + mock-test start org-filtered. **Verified: typecheck/lint/144 unit ✅ + live 2-tenant smoke 19/19 ✅ + shared read/manage ✅**, `scripts/mt2-isolation-smoke.ps1`)*
- [x] **MT-3 — Institutional seat billing** *(`Plan.seatLimit`; `OrgSubscriptionService` provision/seat-info; `createUser` enforces cap; Super-Admin `…/organizations/:id/subscription`; web seat usage + provisioning UI. **Verified: API 151 unit ✅ + web 12 unit ✅ + live 9/9 seat smoke ✅**, `scripts/mt3-seat-billing-smoke.ps1`)*
- [x] **MT-4 — Org-admin UI polish + Postgres RLS** *(auth payload `organizationName` + 🏢 shell chip + Super-Admin seat-usage/provisioning UI; enforced RLS: `pharmacy_app` role + ENABLE/FORCE RLS + tenant policies on 5 content tables via `prisma/sql/rls.sql`/`db:rls`; `APP_DATABASE_URL` + `PrismaService` proxy + ALS + `RlsInterceptor`. **Verified: psql DB proof + MT-2 20/20 & MT-3 9/9 live with RLS on + student practice 201 + API 151/web 12 unit ✅**)*

**🎉 Multi-tenancy COMPLETE (MT-1…MT-4)** — Individual (B2C) + Institutional (isolated, seat-billed, RLS-enforced) plans.

### Question bulk-import — multi-sheet Excel + per-org codes (done)
- [x] **questionCode now unique PER ORGANIZATION** (was global) — global `@unique` replaced by two partial unique indexes (per-org + shared, live rows only) in migration `20260607160000_question_code_per_org`; deleting a question frees its code. Duplicate within an org → 409; **same code across orgs is allowed** (no cross-tenant collision/leak). Text dedup (`findByNormalizedHash`) is likewise scoped to the question's org bucket (app-layer) + RLS. **Verified: `scripts/question-code-per-org-smoke.ps1` 3/3.**
- [x] **Multi-sheet `.xlsx` template** (`apps/web/.../admin/questions/import/page.tsx`, uses `exceljs`, code-split via dynamic import): one sheet per type (`SINGLE_CHOICE, MULTI_CHOICE, ASSERTION_REASON, TRUE_FALSE, NUMERIC, MATCHING`) + a `READ_ME`, each with sample rows. Upload auto-reads ALL sheets (sheet name → type); deleted/renamed/unknown sheets are skipped. **In-file duplicate codes skipped.** CSV paste kept as an advanced fallback. **Verified: web build (exceljs bundles, separate chunk) + `scripts/mt-xlsx-roundtrip.cjs` 5/5 + live create/dedup.**
- [x] **All mapping types in the import** — per-row `knowledgeCodes`/`examCodes` (by code), `curriculumNodes`/`trackModules` (as `PARENT_CODE>CHILD` — curriculum node by code|name, track module by name), and `tags`; resolved client-side → `setKnowledge/Exam/Curriculum/Track Mappings`/`setTags`; unknown refs reported, don't fail the row. **Verified live: `scripts/question-import-mappings-smoke.ps1` 7/7** (knowledge+exam+curriculum+track+tags all reflected on the question). Fixed a real bug found in testing: `fetchKnowledgeMap` used `pageSize=200` (>100 cap) → now 100.
- [x] **Idempotent import (skip duplicates)** — a 409 (`already exists`, code or identical text) and in-file duplicate codes are now reported as **Skipped** (amber), not errors. Summary shows `N created · N skipped · N errors`. So re-uploading a file that's already imported is clean, not all-red.
- [x] **Ready-to-upload v2 bank** — `pharmacy-questions-v2.xlsx` (182 Qs, `PH2-*` codes, all-new text, ≥30/type) via `scripts/generate-question-workbook-v2.cjs`; the referenced taxonomy is created by `scripts/setup-pharmacy-taxonomy.ps1` (12 knowledge nodes + 5 edges, 3 exams, BPHARM-SYL + 11 nodes, GPAT-PREP + 12 modules) so every mapping resolves. **Validated 182/182 + all refs resolve.**

### Bulk question workflow actions (done)
- [x] **Bulk accept/reject/submit/publish/archive/delete** — `POST /questions/bulk { ids, action }` (`question.service.bulkAction`): one permission check per batch (action→permission map), each question attempted independently, per-id results returned (`BulkActionResultDto`). Web: multi-select checkboxes + "Select all N matching", a bulk action bar (perm-gated buttons), result summary, on the admin Questions page. `questionApi.list` gained `page`/`pageSize`. **Verified: API typecheck/lint/151 unit + web typecheck/lint/12 unit + build + live `scripts/bulk-actions-smoke.ps1` 8/8** (submit→reject→approve→publish, partial-failure handling, student denied 403, bulk delete).

Optional follow-ups: exclude payment/external-I/O routes from the per-request RLS tx (or savepoint); extend RLS to more tables; deferred MT-2 nuance (tenant manage-guard on question direct-by-id workflow actions + review-queue).

---

### Student practice filters (done)
- [x] **Practice = random by default + optional filters.** Student practice page (`apps/web/.../practice/page.tsx`) now offers Topic/subject (knowledge), Exam, Curriculum node, Track module, Difficulty, and Count — all optional ("Any" = random whole-pool draw). Added `curriculumNodeId` to `startPracticeSessionSchema` + practice repo `curriculumMappings` filter (knowledge/exam/track/tags/difficulty were already supported). **Verified: API 151 unit + web 12 unit + build, and live `scripts/practice-filters-check.cjs` 8/8** (random + each filter + combo return questions; unmatched filter → clean 400). (`practice-filters-smoke.ps1` hits a PowerShell Invoke-RestMethod POST quirk — use the .cjs.)
- [x] **Count field = total available, type-any-number.** Replaced the fixed 5/10/20… dropdown with a number input that **defaults to the total questions matching the current filters** and updates live as filters change; the student can type any custom count up to that total. New `GET /practice/sessions/available` endpoint (`practiceAvailableQuerySchema` → `{ available, max }`) backed by `PracticeRepository.countPublishedCandidates` (shares `buildPoolWhere` with candidate selection so count and draw stay in lockstep). Bumped per-session ceiling `PRACTICE_MAX_QUESTIONS = 500` (`startPracticeSessionSchema.count` max) so "all available" (182) can be the default. Start button disabled + "No questions match" hint when available=0. **Verified: API typecheck/lint/151 unit + web typecheck/lint/build, and live `scripts/practice-available-check.cjs` 8/8** (whole pool=182, topic=28, exam+EASY=61, no-match=0, filters narrow the pool, start count=182 → 182 questions).

### Plan page — chosen-plan focus + institution privacy (done)
- [x] **Individual user: show only the chosen plan + "view more plans available".** Plans page (`apps/web/.../plans/page.tsx`) now leads with the user's active plan (full details, "Current" badge, no buy button) and an expander **"View more plans available (N)"** that reveals the rest with subscribe buttons. No active plan → a "Choose a plan" grid.
- [x] **Institution member: no plan details — text-only card.** A user whose access is institution-managed sees only a single "Institutional plan" card ("Your access is provided by <institution>. Managed by your administrator."). No prices, features, or buy buttons.
- [x] **Institution admin: sees only their institution's chosen plan.** Org admins (`subscription:read`) get a card with the org's plan name/code, status, seats used/limit, seats available, and period — via new **`GET /commerce/me/organization/subscription`** (`OrgSubscriptionService.getForOrg`, org-scoped to the caller's own org; `SUBSCRIPTION_READ`-gated so one admin can't read another institution's billing).
- [x] **Correct "under an institution" signal.** Belonging to the single-tenant **Default Organization** must NOT trigger the institutional UI. Added `institutionManaged` + `institutionName` to `EntitlementsDto`, computed in `EntitlementService.getEntitlements(userId, organizationId)` = org has an **active seat (institutional) plan** (`seatLimit` set). `me/entitlements` now passes the caller's org. UI routes off `institutionManaged`, not raw `organizationId`.
- **Verified:** contracts build · API typecheck/lint/154 unit (incl. 3 new entitlement cases) · web typecheck/lint/12 unit/build, and live **`scripts/plan-visibility-check.cjs` 10/10** (org admin sees plan+seats 2/25; member institutionManaged but 403 on org-sub; default-org student institutionManaged=false → normal page; super admin 200 null). Note: the script leaves one throwaway test org + plan + 2 users behind.

### User admin — hide higher privilege tiers (done)
- **Problem:** a non-super **Admin** could SEE (and Suspend / re-role) **Super Admin** accounts in the Users list. Root cause: both super admins are seeded INTO the Default Organization (`admin.seeder.ts`, `demo.seeder.ts`), and user-admin scoping was **org-only with no privilege check** (`AdminService.scopeOrgId` + `requireUser` checked org-equality, not rank).
- **Decision:** "Hide higher tiers" — a non-super admin may see/manage only accounts **at or below their own rank**; Super Admins are filtered out server-side and untouchable.
- [x] **Rank model in contracts** (`packages/contracts/src/identity/rbac.ts`): `SYSTEM_ROLE_RANK` (Student 0 → Content Author 1 → Reviewer 2 → Academic Head 3 → Admin 4 → Super Admin 5, mirrors the permission supersets), `roleRank(names)` (max; unknown/custom = 0), `rolesAboveRank(rank)`.
- [x] **List filter** (`AdminRepository.listUsers` + `AdminService.listUsers`): excludes users holding any role ranked above the actor (`userRoles: { none: { role: { name: { in: rolesAboveRank } } } }`). Super Admin actor → exclude `[]` (sees all).
- [x] **View/mutate guard** (`AdminService.requireUser`): a target above the actor's rank → **404** (same hide-existence treatment as cross-org), so GET-by-id / Suspend / role-change on a higher tier all 404 before any write.
- [x] **No upward escalation** (`assertCanGrantRole`, applied in `assignRole` + `createUser`): granting a role ranked above the actor → **403**.
- [x] **UI** (`admin/users/page.tsx`): both role pickers (create-user + per-row "Add role") capped at the viewer's rank via `roleRank` (defense + UX; backend still enforces).
- **Verified:** contracts build · API typecheck/lint/**159** unit (+5 new tier cases) · web typecheck/lint/build, and live **`scripts/admin-tier-visibility-check.cjs` 8/8** (admin sees 6 users / 0 Super Admins; GET/suspend Super Admin → 404; grant Super Admin role → 403; super admin still sees all; no mutation — Super Admin still ACTIVE). Script uses existing demo accounts only; creates nothing.
- **Follow-up (done):** mock-test **# Questions** reconciliation — see "Mock tests — derived count" below.

### Exam blueprints — weight-driven + honored mix + top-up (done)
- **Problem:** of the three per-item knobs, only `questionCount` affected assembly — **`weightPercent` and `difficultyMix` were dead** (collected/displayed, never used) — and `questionCount` was **not reconciled** with `totalQuestions`, so `generateFromBlueprint` did order-dependent `.slice(0,total)` truncation + silent under-fill (e.g. a "50-Q" blueprint with items summing to 100 dropped whole sections).
- **Decisions:** weight-driven (Weight % is the source of truth, sums to 100%, **# Qs derived**); assembly **honors difficulty mix + tops up** shortfalls; under-supply surfaces to authors instead of silently truncating.
- [x] **Pure planner util + tests** (`apps/api/.../exam/blueprint-plan.util.ts`): `targetCountsFromWeights` (largest-remainder; weights are literal % of the paper, so <100% leaves an intentional top-up gap), `splitByRatio` (difficulty mix as relative weights), `largestRemainder`. 8 unit tests.
- [x] **Weight-driven assembly** (`TestSessionService.generateFromBlueprint`): derive per-section counts from weights → draw each section by its difficulty mix → backfill section shortfalls → **top up** to `totalQuestions` from the broader exam pool. Replaces the old slice-truncation.
- [x] **Model + validation** (`ExamBlueprintService`): `# Qs` derived in `toBlueprintDto` (largest-remainder); blueprint DTO gains **`weightTotal` + `isReady`**; `questionCount` made author-optional in the contract (ignored, stored as derived echo).
- [x] **Author-facing dry run** — new **`GET /exams/:examId/blueprints/:bpId/plan`** (`ExamBlueprintService.plan` + `ExamRepository.countPublishedCandidates`): per-section target vs. available, `sourceableCount`, `warnings` (under-supplied sections, weight gaps), `isReady`. EXAM_READ-gated, tenant-scoped.
- [x] **UI** (`admin/exams/page.tsx`): `# Qs` is now a read-only **derived preview** (weight × total); blueprint shows a **weights NN% / left** badge; a **"Validate pool"** button renders the plan (per-section need vs. have + warnings).
- **Verified:** see combined live run below.

### Tracks — knowledge drives a module's questions (done)
- **Problem:** the **"Map knowledge to a module"** screen wrote `TrackKnowledgeMapping` (module↔knowledge) that **nothing read**; practice-by-module filtered on the *separate* `QuestionTrackMapping` (question↔module, set during authoring). So mapping knowledge to a module had **zero effect** on its questions.
- **Decision:** knowledge drives questions — a module's pool = questions tagged with the module's knowledge nodes.
- [x] **Practice pool resolution** (`PracticeRepository`): `findPublishedCandidates`/`countPublishedCandidates` resolve a `trackModuleId` → the module's knowledge nodes (`resolveTrackKnowledgeIds`) and match via `knowledgeMappings` (in an `AND` array to avoid colliding with an explicit knowledge filter). An unmapped module → `[]` → 0 questions (signals "configure me"). The orphaned `QuestionTrackMapping` is no longer used for practice.
- **Verified:** contracts build · API typecheck/lint/**170** unit (+11: 8 planner, 3 blueprint) · web typecheck/lint/build, and live **`scripts/blueprint-tracks-check.cjs` 8/8** (blueprint: 50%/50% → derived 25/25, weightTotal 100/isReady, plan allocates 50 + flags 0-supply, >100% rejected; tracks: unmapped module → 0, mapping "Biochemistry" → exactly its 13 questions). Note: the script leaves a throwaway exam/blueprint + track/module behind. Blueprint *assembly* (mix + top-up) is unit-tested; not in the live script (needs a published-from-blueprint mock + populated pool).

### Mock tests — derived count + publish guard (done)
- **Problem:** the FIXED mock build form had a free-typed **# Questions** (`totalQuestions`) never reconciled with the questions actually attached via "Manage questions" — you could declare 18 and attach 3, and could publish an empty mock.
- **Decision:** a FIXED mock's count IS its attached set (derive it); BLUEPRINT mocks keep an author-set target the blueprint fills to.
- [x] **Derived count** (`MockTestRepository.setQuestions`): sets `totalQuestions = items.length` atomically with the attach (same `$transaction`).
- [x] **FIXED-only hand-picking** (`MockTestService.setQuestions`): rejects a hand-picked list on a BLUEPRINT mock (400).
- [x] **Publish guard + no manual drift** (`MockTestService.update`): blocks publishing a FIXED mock with 0 questions (400); ignores manual `totalQuestions` edits for FIXED (count stays derived). `totalQuestions` made optional in `createMockTestSchema` (FIXED omits → 0; BLUEPRINT requires ≥1 via superRefine).
- [x] **UI** (`admin/mock-tests/page.tsx`): removed the free-typed # Questions input (hint: count is set from attached questions); **Publish disabled until ≥1 question** attached.
- **Verified:** contracts build · API typecheck/lint/**175** unit (+5 mock-test cases) · web typecheck/lint/build, and live **`scripts/mock-count-check.cjs` 8/8** (new FIXED mock = 0; publish-empty → 400; attach 2 → derived 2; persists on GET; publishes; manual 99 ignored → stays 2; BLUEPRINT rejects hand-picked list → 400). Note: leaves a throwaway exam/blueprint + 2 mocks behind.

### Carried-forward implementation notes (apply in the relevant phase)
- UUID v7 PKs; `created_at/updated_at` everywhere; `created_by/updated_by` on content.
- Transactional outbox for all DB→queue publishing (Phase 12/15 infra, used everywhere).
- `answer_spec` JSONB + strategy scoring engine (Phase 5/10).
- Dedup: `normalized_text_hash` + `pg_trgm` (Phase 5).
- Events: monthly partitioning + S3 archive (Phase 12).
- `SearchPort` abstraction, PG-FTS adapter (Phase 5), ES adapter (later).
- Money as integer minor units + currency (Phase 14).
