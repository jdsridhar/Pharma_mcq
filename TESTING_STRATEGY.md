# TESTING_STRATEGY.md — Phase 18

> How the Pharmacy MCQ Platform is tested: the layers, what each covers, the conventions that
> keep tests fast and deterministic, how to run every suite locally and in CI, and the roadmap
> for what's deferred. The automated suites described here already exist and pass; this document
> codifies the strategy and the gaps.

**Status (2026-06-06):** API **128 unit tests** (32 suites) ✅ · Web **12 unit tests** (2 suites)
✅ · **15 API e2e suites** authored, awaiting a live Postgres + Redis. Lint + typecheck green
across all packages.

---

## 1. Philosophy & the test pyramid

```
            ╱╲        E2E (few, high-value)        — full HTTP stack + DB + Redis
           ╱──╲                                       supertest → NestJS AppModule
          ╱────╲      Integration (selective)       — module wiring, repositories vs real SQL
         ╱──────╲                                      (folded into e2e here)
        ╱────────╲    Unit (the broad base)         — services w/ mocked deps; PURE engines;
       ╱──────────╲                                    web client + store
```

Principles:
1. **Push logic down to pure functions.** The hardest rules (scoring, scheduling, mastery,
   planning, billing periods, templating) live in dependency-free modules that are unit-tested
   exhaustively without a DB or DI container — fast, deterministic, no mocking.
2. **Unit tests are the default.** Every service is tested with its collaborators (Prisma,
   Redis, queues, ports) mocked. These run in milliseconds and gate every commit.
3. **E2E proves the wiring**, not every branch: real HTTP → guards → pipes → services → Prisma
   → Postgres, plus auth/refresh, RBAC enforcement, and the `{error}` envelope.
4. **Tests are deterministic.** No real network, clock, or randomness leaks into unit tests;
   time and IDs are injected or mocked.
5. **Security invariants are tested as first-class behaviour** — e.g. served practice/assessment
   questions must never carry `isCorrect`/`answerSpec`; protected routes must 401/403.

---

## 2. Layer 1 — Pure-engine unit tests (no DB, no DI)

The reusable engines are plain TS, imported directly and asserted over a table of cases. They
carry the densest branch coverage in the codebase.

| Engine | Spec | Covers |
|---|---|---|
| `common/evaluation/answer-evaluator.ts` | `answer-evaluator.spec.ts` | correctness per `QuestionType` (single/multi/true-false/numeric/assertion/matching), tolerance, partial-credit rules |
| `modules/assessment/scoring/score-attempt.ts` | `score-attempt.spec.ts` | marks + **negative marking**, skips, max-score, accuracy |
| `modules/revision/scheduler/revision-scheduler.ts` | `revision-scheduler.spec.ts` | spaced-repetition interval growth, due dates, lapse reset |
| `modules/analytics/mastery/mastery.ts` | `mastery.spec.ts` | accuracy/speed/retention → mastery score, clamping |
| `modules/recommendation/*` | `recommendation-engines.spec.ts` | weak-area detection + study-plan distribution |
| `modules/commerce/billing/period.ts` | `period.spec.ts` | period boundaries for billing intervals |
| `modules/notification/templates/templates.ts` | `templates.spec.ts` | template render + variable substitution |
| `modules/identity/utils/duration.util.ts` | `duration.util.spec.ts` | `15m`/`30d` → ms parsing + fallbacks |
| `modules/question/utils/normalized-hash.util.ts` | `normalized-hash.util.spec.ts` | dedup hash normalization (case/space/punctuation) |

**Target: ~100% lines/branches** on engines (they are small and total). Treat a new branch
here as requiring a new case.

---

## 3. Layer 2 — Service / unit tests (mocked collaborators)

Each domain service is instantiated via `@nestjs/testing` `Test.createTestingModule` (or direct
`new Service(...)`) with **mocked** `PrismaService`, `RedisService`, queue producers, and ports.
Suites assert business rules, guard/permission logic, error mapping, and the **no-answer-leak**
serialization.

Representative suites (32 total): identity (`password`, `token`, `policy`, `permissions.guard`),
knowledge, question, curriculum (+ `curriculum-node`), exam (+ `exam-blueprint`), learning (+
`track-module`), practice (+ `practice-analytics.repository`), assessment (`test-session`),
revision, analytics (`mastery.service`), recommendation, commerce (`subscription`,
`entitlement`), notification, admin, and `health.controller`.

**Mocking conventions:**
- **Prisma:** a typed partial mock — `{ user: { findUnique: jest.fn(), … }, $transaction: (fn) => fn(txMock) }`.
  Mock only the methods the unit calls.
- **Queues (BullMQ):** producers are best-effort (`try/catch`); mock `.add()` and assert it was
  *called* (or swallowed) — never require a real Redis.
- **Ports (Mailer/Payment/NotificationChannel):** inject an in-memory fake; assert calls.
- **Time/IDs:** pass clocks/UUIDs in, or `jest.useFakeTimers()` / mock the generator.

### Known gotcha — full-object fixtures
Service methods map Prisma rows into DTOs (`row.createdAt.toISOString()`, nested
`curriculumMappings`, `examMappings`, etc.). A **partial** mock row throws at map time
(`undefined.toISOString()`). **Always return a complete row fixture** shaped like the real query
result (all selected scalar fields as real `Date`s, all included relations as arrays). This was
the single most common cause of unit-test breakage during the build.

---

## 4. Layer 3 — End-to-end tests (live stack)

`apps/api/test/*.e2e-spec.ts` (15 suites) boot the **real** `AppModule` with supertest and hit
HTTP routes. They mirror `main.ts`: `setGlobalPrefix('api')`, URI versioning (`/v1`),
`ZodValidationPipe`, `AllExceptionsFilter`, `cookie-parser`. They require **Postgres + Redis**
and a **migrated + seeded** database (default org + system roles + dev super-admin).

Suites: `app` (health), `auth` (register/login/me/refresh-rotation/RBAC 401s), knowledge,
question, curriculum, exam, learning, practice, assessment, revision, analytics, recommendation,
commerce, notification, admin.

What e2e specifically proves (beyond units):
- JWT access + **refresh-cookie rotation** and reuse handling end to end.
- Guard chain (`JwtAuthGuard → PermissionsGuard → RolesGuard`) — `@Public()` opens, missing
  permission → 403, missing token → 401.
- Zod validation → real `400` with the `{error}` envelope; not-found → `404`; conflicts → `409`.
- Snapshot immutability, live ranking/percentile, entitlement gating across real rows.

> These are **deferred** on this build machine (no Docker host). They are written for CI, where
> Postgres/Redis are service containers. See §6 for the exact run sequence.

---

## 5. Layer 4 — Web unit tests

`apps/web` uses **Jest + ts-jest** (node env) for the framework-free logic with real bug
surface. Config: `apps/web/jest.config.cjs` + `apps/web/tsconfig.jest.json`; tests live in
`apps/web/test/` (excluded from the app `tsconfig`/Next build, still linted).

| Suite | Covers |
|---|---|
| `test/api-client.spec.ts` | bearer attach + `credentials:'include'`; `{error}` → `ApiClientError`; **401 → single silent `/v1/auth/refresh` → retry with new token**; refresh-fail clears token + no retry; never refreshes the refresh endpoint |
| `test/auth-store.spec.ts` | `login`/`bootstrap` set user+status+token; `logout` clears even when the API call throws; `hasPermission`/`hasRole` selectors; anonymous fallback |

`global.fetch` is mocked per test; `@/lib/api/endpoints` is `jest.mock`-ed for the store tests so
they exercise store logic only. **Deferred:** component tests (React Testing Library + jsdom) and
browser **E2E (Playwright)** for the question player and timed mock runner — see §8.

---

## 6. Running the suites

```bash
# Unit — fast, no services (run on every change)
corepack pnpm --filter @pharmacy/api  test          # 128 tests / 32 suites
corepack pnpm --filter @pharmacy/web  test          # 12 tests / 2 suites
corepack pnpm test                                  # turbo: all packages' `test`

# Coverage
corepack pnpm --filter @pharmacy/api  test:cov      # → apps/api/coverage

# Static gates
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm build

# E2E — needs Postgres + Redis + a migrated/seeded DB
corepack pnpm docker:up                             # postgres, redis, minio, mailpit
corepack pnpm db:migrate:deploy                     # apply schema
corepack pnpm --filter @pharmacy/api db:sql         # trigram/FTS/partition objects
corepack pnpm db:seed                               # default org + roles + dev admin
corepack pnpm --filter @pharmacy/api test:e2e       # jest --config test/jest-e2e.json --runInBand
corepack pnpm docker:down
```

> **After editing `@pharmacy/contracts`,** rebuild it (`corepack pnpm --filter @pharmacy/contracts build`)
> before building API/web. Jest itself maps `@pharmacy/contracts`/`@pharmacy/config` to their
> `src` via `moduleNameMapper`, so tests pick up contract changes without a rebuild.

---

## 7. Coverage targets

| Area | Target | Rationale |
|---|---|---|
| Pure engines | **95–100%** lines/branches | small, total, business-critical |
| Domain services | **≥ 80%** lines | core rules + error paths; exclude trivial DTO plumbing |
| Web client/store | **≥ 80%** of `lib/` + `store/` | refresh/retry + auth transitions covered today |
| Controllers / modules | smoke via e2e | wiring proven by e2e, not line-chased in units |

Coverage is **collected** (`collectCoverageFrom` in the API Jest config) but not yet a hard CI
gate. Phase 20 wires a threshold check once e2e runs in CI so the denominator is realistic.

---

## 8. CI matrix (to be implemented in Phase 20)

Two jobs; the deployment phase writes the actual workflow file.

**Job `quality`** — every push/PR, no services:
```
install (pnpm, --frozen-lockfile)
  → build (^build deps: contracts/config first)   # turbo run build
  → lint                                           # turbo run lint
  → typecheck                                      # turbo run typecheck
  → unit                                           # turbo run test  (api + web)
```

**Job `e2e`** — push/PR (can run in parallel with `quality`), with service containers:
```
services: postgres:16, redis:7
install → prisma migrate deploy → db:sql → db:seed
  → pnpm --filter @pharmacy/api test:e2e           # --runInBand
env: DATABASE_URL, REDIS_URL → the service containers; JWT/seed secrets from CI secrets
```

Notes: turbo caches `build`/`lint`/`typecheck`/`test` (keyed on inputs); `test:e2e` is
`cache:false`. The root `prepare` hook (`husky || true`) is a no-op on Linux CI even without
husky installed.

---

## 9. Conventions cheat-sheet

- **Location:** unit specs are colocated (`*.spec.ts` next to the unit); API e2e in
  `apps/api/test/*.e2e-spec.ts`; web unit in `apps/web/test/*.spec.ts`.
- **Shape:** Arrange-Act-Assert; one behaviour per `it`; describe-block per unit.
- **Determinism:** no real time/network/randomness in units; inject or mock them.
- **Fixtures:** full, realistically-shaped objects (see §3 gotcha); prefer small factories over
  sharing mutable fixtures across tests.
- **Security:** assert no-answer-leak on served questions and 401/403 on protected routes.
- **Async:** `await` every promise; `--runInBand` for e2e (shared DB state).

---

## 10. Gaps & roadmap

1. **Run the e2e suites in CI** (Phase 20) — the specs exist; they need the services job above.
2. **Web component tests** (RTL + jsdom) for the question player (all 6 types, feedback lock) and
   the timed runner (countdown auto-submit, navigator). Add `jest-environment-jsdom` +
   `@testing-library/react` when introduced.
3. **Browser E2E (Playwright)** for the critical student journeys: register → practice → review,
   and start → attempt → submit → ranked result.
4. **Coverage thresholds** as a CI gate once e2e runs (realistic denominator).
5. **Contract tests** could be added if the web ever talks to a separately-deployed API version;
   today the shared `@pharmacy/contracts` package eliminates client/server drift by construction.
6. **Load/perf** (k6) for hot paths (pool selection, ranking) — defer to post-launch.
```
