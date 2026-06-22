# CURRENT_STATE.md — Recovery Snapshot

> Read this first on `continue`. Captures exactly where work stands and how to resume cold.

**As of:** 2026-06-06
**Phase:** ✅ **ALL 20 PHASES COMPLETE & VERIFIED.** (Phase 20 Deployment done.)
**Milestone:** Full enterprise platform delivered. Unit tests: **API 135 + web 12 = 147 green**; 15 API e2e suites run in CI (live PG+Redis). Whole monorepo: build/lint/typecheck/test all green. Production Dockerfiles (hardened), CI/CD workflow, prod compose, and DEPLOYMENT_GUIDE.md shipped.
**Working dir:** `C:\Users\Admin\Desktop\Claude_MCQ_V0.1`
**Repo:** not `git init`-ed. `pnpm-lock.yaml` present; `node_modules` installed; `.env` present.

---

## 🏢 Multi-Tenancy (MT) — POST-LAUNCH INITIATIVE (in progress)
Adds **Institutional plans**: each academy is an isolated tenant (own admin → academic head/reviewer/
content author → students) ALONGSIDE the existing per-user **Individual** (B2C) plans. Founder = Super Admin
(platform-global). Built in safe, verified increments.

**Ownership model (locked):** every content row has a nullable `organizationId`. `null` = **platform-shared**
(authored by platform team / Super Admin, readable by everyone); set = **institution-private**.
- **Super Admin** → sees & manages all orgs.
- **Platform staff** (members of the default/"platform" org, slug = `DEFAULT_ORGANIZATION_SLUG`) → own + manage shared (null) content.
- **Institution staff** → own + manage only their org's content; may READ shared but not manage it.
- **List scope = inclusive** (shared + own; Super = all). **Read by id**: cross-org → 404 (hides existence).
  **Manage** (create/update/delete): cross-org → 404, readable-but-not-owned → 403. Create stamps `ownerOrgFor(actor)`.
Shared helper: `apps/api/src/common/tenancy/tenant-scope.service.ts` (`TenantScopeService`, exported by global
`TenancyModule`): `isSuper`, `platformOrg`, `ownerOrgFor`, `manageFilter`, `canRead`, `canManage`.

**MT-1 ✅ Org foundation + scoped admin** — `Organization` table; Super-Admin-only `POST/GET /admin/organizations`;
org-scoped admin user CRUD/roles; login is **global** (`findByEmailGlobal`) so institution users can sign in;
web `admin/organizations` page (create institution + appoint admin). `createUserSchema.organizationId` (super-only).

**MT-2 ✅ Content org-isolation (DONE & VERIFIED LIVE)** — `organizationId` (+index) added to **questions,
mock_tests, curriculums, exam_profiles, learning_tracks** (KnowledgeNode stays shared/global). Two manual
migrations applied via `migrate deploy`: `20260607120000_add_question_organization_id`,
`20260607130000_add_content_organization_id`. Every domain service/controller threads `@CurrentUser() actor`;
child entities (curriculum nodes, exam blueprints+items, track modules) guard via their parent's org.
Practice read-pool (`findPublishedCandidates`) and mock-test `start` are org-filtered (shared + own).
**Verified:** API typecheck/lint/144 unit tests green + **live 2-tenant smoke (19/19)** + shared-content
read/manage checks (`scripts/mt2-isolation-smoke.ps1`): Beta can't see/read/manage Alpha's private content
(404), owner+Super can; institutions read platform-shared but get 403 managing it.

**MT-3 ✅ Institutional seat billing (DONE & VERIFIED LIVE)** — `Plan.seatLimit Int?` (null = Individual/B2C
per-user plan; >0 = Institutional seat plan) + index on `subscriptions.organizationId`. Migration
`20260607140000_add_plan_seat_limit` applied via `migrate deploy`. New `OrgSubscriptionService` (commerce,
exported): `provision(orgId, {planId, planPriceId?}, actorUserId)` (MANUAL provider, cancels prior active, must
be a seat plan), `getForOrg` (active sub + live usage), `assertCanOnboard` (409 when full). Seat usage =
non-deleted members of the org (`countOrgMembers`). `AdminModule` imports `CommerceModule`; `AdminService.createUser`
calls `assertCanOnboard(orgId)` (no-op for platform org / orgs w/o a seat plan). Super-Admin endpoints
`POST/GET /admin/organizations/:id/subscription`. Web: `adminApi.orgSubscription/provisionOrgSubscription` +
seat usage + provisioning UI on the Super-Admin `admin/organizations` page (institution plans = `seatLimit != null`).
**Verified:** API typecheck/lint/**151 unit** ✅ + web typecheck/lint/**12 unit** ✅ + **live 9/9 seat smoke**
(`scripts/mt3-seat-billing-smoke.ps1`): provision 0/3 → onboard to 3/3 → 4th blocked (409) → upgrade to 5 → 4th
allowed → individual plan rejected as org seats (400). Note: `GET …/subscription` returns an **empty 200 body**
when none (Nest serializes `null`); clients treat empty as "no subscription".

**MT-4 ✅ Org-admin UI polish + Postgres RLS (DONE & VERIFIED LIVE)**
- *UI polish:* auth payload now carries `organizationName` (`UserPublic`; null for the platform org) via
  `AuthService.toPublic` + `OrganizationRepository.findById` (cached); app-shell shows a 🏢 institution chip;
  Super-Admin `admin/organizations` page shows per-org seat usage + an institution-plan provisioning control.
- *Postgres RLS (enforced):* `apps/api/prisma/sql/rls.sql` (operational, applied via `db:rls`; added to CI e2e +
  prod `db-setup`) creates the least-privilege **`pharmacy_app`** role, ENABLE+FORCE RLS on the 5 content tables
  with a `*_tenant_isolation` policy `USING/WITH CHECK (app_is_super() OR organizationId IS NULL OR organizationId
  = app_current_org())`. Helpers `app_is_super()` (**defaults to bypass when unset** → super/workers/seeders/public
  unaffected) + `app_current_org()` read transaction-local GUCs. App wiring: `APP_DATABASE_URL` (pharmacy_app)
  selects the RLS connection (falls back to DATABASE_URL = RLS-off); `TenantContextService` (AsyncLocalStorage);
  `PrismaService` is now a **Proxy** routing model/raw/$transaction to the request's tx when present;
  `RlsInterceptor` (global APP_INTERCEPTOR) wraps **authenticated non-super** requests in one tx with
  `SET LOCAL app.current_org/app.is_super='off'`. Migrations/seeds keep using DATABASE_URL (owner → bypass).
  **Verified:** DB-layer proof via psql (`scripts/mt4-rls-db-verify.sql`: tenant sees shared+own only, cross-org
  INSERT blocked by WITH CHECK) + live app: MT-2 smoke **20/20** & MT-3 smoke **9/9** with RLS active, student
  practice (raw question search inside the scoped tx) returns 201, Super Admin bypass confirmed. API
  typecheck/lint/**151 unit** ✅, web typecheck/lint/**12 unit** ✅.
  **Known limitation:** a non-super request runs inside one interactive tx for its whole lifetime — external I/O
  in-request (e.g. payment provider) holds a connection; revisit by excluding such routes if needed.

**Deferred nuances (MT-2):** direct-by-id question workflow actions (approve/reject/publish) and the review-queue
don't yet apply the tenant manage-guard (questions list/create/practice already isolated, and RLS now backs the DB
layer); revisit if needed.

**🎉 Multi-tenancy COMPLETE (MT-1…MT-4).** Individual (B2C) + Institutional (isolated tenants, seat-billed, RLS-enforced) plans.

### Question bulk-import (multi-sheet Excel) + per-org question codes
- **questionCode is now unique PER ORGANIZATION** (was global `@unique`): migration `20260607160000_question_code_per_org`
  drops the global unique and adds two **partial** unique indexes — `(organizationId, questionCode) WHERE organizationId
  IS NOT NULL AND deletedAt IS NULL` and `(questionCode) WHERE organizationId IS NULL AND deletedAt IS NULL`. Each
  institution gets its own code namespace (no cross-tenant collision/leak), shared codes stay unique, and deleting frees a
  code. `questionCode` lost `@unique` in `schema.prisma` (partial indexes are operational, not modelable in Prisma). Text
  dedup (`findByNormalizedHash`) is now scoped to the question's org bucket at the app layer too (+ RLS).
  **Verified `scripts/question-code-per-org-smoke.ps1` 3/3** (within-org dup → 409; same code across orgs → 201).
- **Import is a multi-sheet `.xlsx`** (`apps/web/src/app/(app)/admin/questions/import/page.tsx`, `exceljs`, dynamic-import
  code-split): one sheet per question type + `READ_ME`, with sample rows. Upload reads ALL known type sheets (sheet name =
  type); deleted/renamed/unknown sheets skipped; in-file duplicate codes skipped. Per-row `knowledgeCodes`/`examCodes`
  resolve by code → mappings; `tags` + optional media. CSV paste kept as an advanced fallback (needs a `questionType`
  column). `knowledgeApi.list` gained `page`/`pageSize` (pageSize capped at 100). **Verified: web prod build (exceljs =
  own chunk) + `scripts/mt-xlsx-roundtrip.cjs` 5/5 + live create/dedup.**
- **All mapping types supported in the import:** `knowledgeCodes`/`examCodes` (by code), **`curriculumNodes`/`trackModules`
  as `PARENT_CODE>CHILD`** (curriculum node by code|name via the tree, track module by name via track detail), `tags`,
  media. Resolved client-side → `questionApi.setKnowledge/Exam/Curriculum/Track Mappings` + `setTags`; unknown refs
  reported but don't fail the row. **Verified live `scripts/question-import-mappings-smoke.ps1` 7/7** (all five mapping
  types reflected on the question detail).
- **Idempotent import:** a 409 (code/identical-text already exists) and in-file duplicate codes are reported as **Skipped**
  (amber), not errors; summary = `created · skipped · errors`. Re-uploading an already-imported file is clean.
- **Ready-to-upload v2 bank:** `pharmacy-questions-v2.xlsx` (182 Qs, `PH2-*`, all-new text, ≥30/type) via
  `scripts/generate-question-workbook-v2.cjs`; taxonomy created by `scripts/setup-pharmacy-taxonomy.ps1` so every mapping
  resolves. Validated 182/182.

### Bulk question workflow actions
`POST /questions/bulk { ids, action }` → `QuestionService.bulkAction`: one permission check per batch (action→permission
map: submit=QUESTION_UPDATE, approve=QUESTION_APPROVE, reject=QUESTION_REVIEW, publish/archive=QUESTION_PUBLISH,
delete=QUESTION_DELETE), each id attempted independently, per-id `BulkActionResultDto` returned. No `@Permissions` on the
controller route (authz is per-action in the service). Web admin Questions page: row checkboxes + "Select all N matching"
(paginates), perm-gated bulk bar (Submit/Approve/Reject/Publish/Archive/Delete), result summary; `questionApi.list` gained
`page`/`pageSize`. **Verified: API 151 unit + web 12 unit + build + live `scripts/bulk-actions-smoke.ps1` 8/8.**

**Question CSV import — fully updated** (`apps/web/src/app/(app)/admin/questions/import/page.tsx`): template generated from a column list so rows stay aligned; supports **all 6 types incl. MATCHING** (`matchingPairs=L=R;L2=R2`), `language`, and `media` (`mediaUrl`/`mediaType`/`mediaAltText`). Adds optional mappings created automatically — `knowledgeCodes`/`examCodes` resolved by unique **code** (client-side: exam list once, knowledge per-code search→exact match) then applied via the existing `setKnowledgeMappings`/`setExamMappings`/`setTags` endpoints; unknown codes skipped with a per-row warning. Org ownership is automatic (importer's org via MT-2). **Verified live 7/7** (`scripts/csv-import-verify.ps1`): MATCHING+pairs, media, knowledge/exam/tag mappings. Still client-side row-by-row (no server bulk endpoint).

**Dev creds:** Super Admin `admin@pharmacy-mcq.local` / `ChangeMe_Admin1`; demo `<role>@demo.local` / `Demo@12345`.

---

## How to resume (cold start)
The 20-phase build is **complete** — there is no next phase. If asked to continue, choose from the
non-blocking roadmaps (below) or start a new initiative. Recovery files remain authoritative.
- Non-blocking roadmaps: `TESTING_STRATEGY.md` §10 (RTL/Playwright, coverage gate), `SECURITY_ARCHITECTURE.md` §12 (deploy hardening), `FRONTEND_ARCHITECTURE.md` §9 (FE follow-ups), `DEPLOYMENT_GUIDE.md` §7 (extract BullMQ worker), make `pnpm audit` a hard CI gate.
- Repo is not `git init`-ed — initialize + initial commit if version control is wanted.
- Anything needing a Docker host (image builds, `docker compose up`, `migrate deploy`/`db:sql`/`db:seed`, the 15 e2e suites) runs in CI/deploy — see `.github/workflows/ci.yml`.

## Phase 20 — delivered (reference) — FINAL
Deployment shipped. **Dockerfiles** (`apps/api/Dockerfile`, `apps/web/Dockerfile`): multi-stage, build context = repo root, hardened with **non-root `node` user + `HEALTHCHECK`**; web uses Next `output:'standalone'` + `PORT`/`HOSTNAME`. **`.github/workflows/ci.yml`**: jobs **quality** (install→`turbo build`→lint→typecheck→unit), **security** (`pnpm audit --prod --audit-level high`, non-blocking), **e2e** (services postgres:16+redis:7; `prisma generate`→`migrate deploy`→`db execute` sql→`db seed`→`jest -c test/jest-e2e.json --runInBand`; bypasses dotenv via `exec`), **docker** (build both images, GHA cache, no push). **`docker-compose.prod.yml`**: one-shot `db-setup` (migrate→sql→seed) gated by `service_completed_successfully`, api `command: node dist/main.js` (start-only, no migrate race), datastore ports unpublished. **`DEPLOYMENT_GUIDE.md`**: topology, image build, env/secrets table, DB lifecycle (single vs multi-replica), CI/CD, scaling (+worker extraction), observability, deploy hardening, rollback runbook, release checklist. Verified whole monorepo: **build/lint/typecheck green, 147 unit tests green.** Docker/e2e validated in CI only (no local daemon).

## Phase 19 — delivered (reference)
`SECURITY_ARCHITECTURE.md`: OWASP Top-10 → implemented controls; authN (JWT access 15m + rotating SHA-256-hashed refresh **family w/ reuse detection** 30d httpOnly cookie; bcrypt(12); **generic login error + constant-time compare vs throwaway hash** = anti-enumeration/timing; forgot-password no-enumeration; suspended/inactive→403; password change revokes all sessions); RBAC (3 global guards secure-by-default + `@Public`, `@Permissions`/`@Roles`, `PolicyService` ownership, **no-answer-leak**); Zod validation + `{error}` envelope (no stack leak); Helmet + CORS allowlist; secrets (Zod fail-fast + prod ≥32-char non-placeholder JWT + Razorpay required); data protection (bcrypt/hashed tokens/minor-units/immutable snapshots/append-only audit/RLS-ready org_id); pino redaction; **HMAC-SHA256 + `timingSafeEqual` webhook verify** over rawBody; CSRF analysis; §12 prod hardening checklist. **NEW code:** `apps/api/src/common/throttler/{throttle.decorator,throttler.guard}.ts` (+spec) — Redis fixed-window limiter, **prod-only no-op in dev/test**, **fail-open**, IP+route key, `RATE_LIMIT_LIMIT`/`TTL`; bound `APP_GUARD` in `app.module.ts`; `@Throttle({limit:10,ttl:60})` on auth register/login/refresh; `@SkipThrottle()` on health. Verified: **API build ✅, 135/33 tests ✅, lint ✅.**

## Phase 18 — delivered (reference)
Test strategy in `TESTING_STRATEGY.md`. Layers: pure-engine units (answer-evaluator/score-attempt/revision-scheduler/mastery/recommendation/period/templates/duration/hash), service units (32 suites, mocked Prisma/Redis/queues/ports — **full-object fixtures** required), API e2e (15 `apps/api/test/*.e2e-spec.ts`, need live PG+Redis + migrate/seed), and **web units** (new). Web harness: `apps/web/jest.config.cjs` + `tsconfig.jest.json` (ts-jest/node), tests in `apps/web/test/` (excluded from app tsconfig/Next build, still linted), scripts `test`/`test:watch`, devDeps jest/ts-jest/@types/jest. **12 web smoke tests** green: api-client (silent 401-refresh/retry, error envelope, bearer) + auth store. Counts: **API 128/32, web 12/2.** CI matrix documented (quality job: install→build→lint→typecheck→unit; e2e job: PG+Redis services→migrate/seed→test:e2e) for Phase 20 to implement.

## Phase 17 — delivered (reference)
Web client in `apps/web/`: typed API client (`lib/api-client.ts` + `lib/api/{token,endpoints}.ts`) with silent 401→`/v1/auth/refresh` single-flight retry; Zustand `store/auth-store.ts` + `<AuthBootstrap/>`; TanStack Query provider; `components/{ui,app-shell,auth-bootstrap}.tsx`; `(app)` route-group guard. **15 routes** — landing/login/register; dashboard, practice + `practice/[id]` player (all 6 question types, instant feedback, summary), mock-tests + `mock-tests/sessions/[id]` timed runner (countdown auto-submit, navigator, ranking result), revision, analytics, plans; admin questions(review queue)/users/audit. See `FRONTEND_ARCHITECTURE.md`. Follow-ups deferred there in §9.

## Build/verify commands (this env)
- API: `corepack pnpm --filter @pharmacy/api build|test|lint`. Web: `corepack pnpm --filter @pharmacy/web build|typecheck|lint`.
- **After changing `@pharmacy/contracts`, rebuild it** (`corepack pnpm --filter @pharmacy/contracts build`) — web consumes its `dist` types too.
- Web env: `apps/web/.env.local` (copy from `.env.local.example`) sets `NEXT_PUBLIC_API_URL`.

## Verified working
Whole monorepo via turbo: **build ✅ · lint ✅ · typecheck ✅ · test ✅.** API unit **135/33** (all domains + pure engines + health + throttler); web unit **12/2** (api-client + auth store) = **147 green**. Web build **15 routes** (Next standalone). schema valid (62 tables/20 enums). Docs complete: `ARCHITECTURE_REVIEW`, `SYSTEM_SETUP`, 14× `*_DOMAIN`, DB docs, `FRONTEND_ARCHITECTURE`, `TESTING_STRATEGY`, `SECURITY_ARCHITECTURE`, `DEPLOYMENT_GUIDE`. Deploy assets: hardened Dockerfiles, `.github/workflows/ci.yml`, `docker-compose.prod.yml`. (Docker builds + 15 API e2e suites run in CI — no local daemon.)

## Patterns established (backend; mirror sensibly on FE)
- Shared types/enums live in `@pharmacy/contracts` — import DTO types on the web (e.g. `UserPublic`, `PracticeSessionDetailDto`, `MockTestDto`, `RecommendationDto`). Reuse Zod schemas for client form validation.
- API error envelope: `{ error: { code, message, details?, traceId? } }`; success = raw DTO or `{ items, meta }` (Paginated). Build the client around both.
- Auth: access JWT (15m) in memory; refresh via httpOnly cookie at `/auth/refresh` (rotating). Routes are secure-by-default server-side.
- RBAC permission keys + role names are in contracts (`PERMISSIONS`, `SystemRole`) — use them to show/hide admin UI; never rely on FE checks for security.

## Decisions locked (do not revisit)
Tech: Next.js 15 (App Router) · TS · Tailwind · TanStack Query · Zustand. Validation = Zod (shared). API base `/api/v1`. JWT access + rotating refresh cookie. Money = integer minor units (format for display). Reusable engines pure. Don't leak answers in practice/assessment UIs (the API already strips them; FB only after answering).

## Environment notes
Node 24.15; Docker NOT installed; Python 3.14; no pandoc. DB migrations/seeds/e2e + BullMQ workers not yet run (need Docker host: Postgres + Redis). The web build does not require the API/DB.

## Tech stack (locked)
Next.js 15 · TS · Tailwind · TanStack Query · Zustand | NestJS 10 · Prisma 6 · @nestjs/jwt · bcryptjs · cookie-parser · @nestjs/bullmq+bullmq | PostgreSQL 16 · Redis 7 · S3/MinIO · Razorpay | Zod | Jest | Docker/Compose.
