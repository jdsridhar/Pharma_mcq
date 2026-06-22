# DEPLOYMENT_GUIDE.md — Phase 20 (FINAL)

> How to build, ship, and operate the Pharmacy MCQ Platform: container images, environment &
> secrets, the database lifecycle, CI/CD, scaling, observability, deploy-time hardening, and a
> rollback runbook. This is the last of the 20 phases — the platform is feature-complete and
> green (**API 135 + web 12 unit tests**; 15 API e2e suites run in CI against live services).

---

## 1. Topology

```
                    ┌─────────────┐
   browser ──────▶  │  reverse    │  TLS / HSTS / WAF (edge — not in this repo)
                    │  proxy      │
                    └──────┬──────┘
                  ┌────────┴─────────┐
                  ▼                  ▼
            ┌──────────┐       ┌──────────┐
            │  web     │ ───▶  │  api     │   NestJS modular monolith
            │ Next 15  │  HTTP │ (4000)   │   (BullMQ workers run in-process today)
            │ (3000)   │       └────┬─────┘
            └──────────┘            │
                          ┌─────────┼───────────┬───────────┐
                          ▼         ▼           ▼           ▼
                     Postgres 16  Redis 7   S3 / MinIO   SMTP
                     (data)       (cache,    (media)     (mail)
                                  queues,
                                  rate limit)
```

Both `web` and `api` are **stateless** → scale horizontally behind the proxy. All durable state
lives in Postgres, Redis, and object storage.

---

## 2. Build artifacts (container images)

Two **multi-stage** Dockerfiles, both built from the **repo root** context:

- **`apps/api/Dockerfile`** — `deps` (frozen-lockfile install) → `build` (build `@pharmacy/config`
  + `@pharmacy/contracts`, `prisma generate`, `nest build`) → `runner`. Runs as the non-root
  **`node`** user; `HEALTHCHECK` hits `/api/health`. Default `CMD` runs `prisma migrate deploy`
  then starts — override to start-only for multi-replica (see §5).
- **`apps/web/Dockerfile`** — builds Next.js with **`output: 'standalone'`** (`next.config.mjs`),
  so the runner copies only the minimal server + `.next/static` + `public`. Non-root `node` user;
  `HEALTHCHECK` on `/`. `NEXT_PUBLIC_API_URL` is a **build arg** (Next inlines `NEXT_PUBLIC_*` at
  build time) — bake the public API URL per environment.

`.dockerignore` files keep build contexts lean. CI builds both images on every PR (the `docker`
job) so the Dockerfiles can't silently rot.

> **Build locally:** `docker build -f apps/api/Dockerfile -t pharmacy-api .` and
> `docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com/api -t pharmacy-web .`

---

## 3. Environment & secrets

`.env.example` is the canonical list; `@pharmacy/config` validates it at boot (**fail-fast**). Key
variables:

| Var | Purpose | Prod requirement |
|---|---|---|
| `NODE_ENV` | runtime mode | `production` (enables rate limiter, secure cookies, secret checks) |
| `DATABASE_URL` / `REDIS_URL` | datastores | managed endpoints |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | token signing | **≥32 chars, non-placeholder** (enforced) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | token lifetimes | `15m` / `30d` (defaults) |
| `BCRYPT_ROUNDS` | password cost | `12`+ |
| `RATE_LIMIT_LIMIT` / `RATE_LIMIT_TTL` | global throttle | tune per traffic |
| `APP_WEB_URL` | CORS origin | exact web origin (https) |
| `NEXT_PUBLIC_API_URL` | web→api base (build arg) | `https://api.<domain>/api` |
| `S3_*` | object storage | managed S3 creds + bucket |
| `SMTP_*`, `MAIL_FROM` | mail | real SMTP |
| `RAZORPAY_KEY_*`, `RAZORPAY_WEBHOOK_SECRET` | payments | **required in prod** (enforced) |
| `SEED_SUPER_ADMIN_EMAIL` / `_PASSWORD` | first admin | **required in prod** (dev default is blocked) |

**Never commit production secrets.** Use a secrets manager (AWS Secrets Manager, GCP Secret
Manager, Vault, or the orchestrator's secret store) and inject at runtime. Rotate JWT secrets on a
schedule (rotation forces re-login, which the refresh design tolerates).

---

## 4. Database lifecycle

Three ordered steps, all idempotent and safe to re-run:

1. **`prisma migrate deploy`** — apply committed migrations (schema: 62 tables / 20 enums).
2. **Advanced SQL** — `prisma db execute --file prisma/sql/search_and_partitioning.sql` (trigram,
   full-text search, partitioning, and other objects Prisma's schema can't express).
3. **`prisma db seed`** — bootstrap the default organization, system roles, and the super-admin
   (dev creds in non-prod; `SEED_SUPER_ADMIN_*` in prod).

**Where to run them:**
- **Single instance / simple host:** the API image's default `CMD` runs step 1 on start; run
  steps 2–3 once as a one-off (`docker compose run --rm db-setup`). `docker-compose.prod.yml`
  bundles all three into a **one-shot `db-setup`** service that the app waits on
  (`service_completed_successfully`), so replicas never race.
- **Multi-replica / Kubernetes:** override the API command to **start-only** (`node dist/main.js`)
  and run migrations as a **Job / initContainer** before rolling out app pods. CI's `e2e` job is a
  working reference for the exact commands.

Migrations are **expand-then-contract** by convention (add columns/tables before removing) so a new
release is backward-compatible with the previous running version during a rolling deploy.

---

## 5. CI/CD (`.github/workflows/ci.yml`)

| Job | Trigger | Does | Gates merge |
|---|---|---|---|
| **quality** | every PR/push | install → `turbo build` → lint → typecheck → unit (147 tests) | ✅ yes |
| **security** | every PR/push | `pnpm audit --prod --audit-level high` | signal (flip to gate) |
| **e2e** | after quality | spin Postgres 16 + Redis 7, migrate → SQL → seed → `jest -c test/jest-e2e.json --runInBand` | ✅ yes |
| **docker** | after quality | build both production images (no push, GHA cache) | ✅ yes |

**Extending to CD:** add a deploy job gated on `main` + green checks that (a) builds & pushes
images to a registry tagged by commit SHA, (b) runs the migration Job, (c) triggers a rolling
update on the orchestrator. Keep deploys **immutable** (deploy the SHA tag, never `latest`).

Turbo caches `build`/`lint`/`typecheck`/`test` by input hash; `test:e2e` is uncached. The repo's
`prepare` hook (`husky || true`) is a no-op on Linux CI even without husky installed.

---

## 6. Running it

**Full stack, single host (dev/staging):**
```bash
cp .env.example .env        # then edit secrets
docker compose up -d --build           # dev compose (adds MinIO + Mailpit)
```
**Production single host:**
```bash
cp .env.example .env        # set real secrets, NODE_ENV=production, NEXT_PUBLIC_API_URL, …
docker compose -f docker-compose.prod.yml up -d --build
```
Datastore ports are not published in the prod compose; reach the app via the `web`/`api` ports
behind your TLS proxy.

---

## 7. Scaling & operations

- **Web / API:** stateless → run N replicas; scale on CPU/RPS. CORS pins the web origin; the
  access token is a self-contained JWT (no sticky sessions needed).
- **Background work:** BullMQ processors currently run **in-process** in the API. To scale
  independently, extract a worker entrypoint that imports the queue/processor modules and run it as
  a separate deployment (the producers already enqueue best-effort) — documented as the next step.
- **Postgres:** use a managed instance with backups + PITR; size connections (Prisma pool) to
  replica count. **Redis:** managed, persistent (AOF) — it backs caching, BullMQ, and the rate
  limiter; for the distributed limiter Redis must be shared across API replicas (it is).
- **Probes:** liveness `GET /api/health`; readiness `GET /api/health/ready` (checks Postgres +
  Redis). Wire these to the orchestrator. **Graceful shutdown** is enabled
  (`enableShutdownHooks` closes Prisma/Redis cleanly).

---

## 8. Observability

- **Logs:** structured JSON via pino to stdout (collect with the platform's log driver →
  Loki/CloudWatch/ELK). `authorization` + `cookie` headers are redacted; every response carries a
  `traceId`; 5xx include stack server-side.
- **Audit:** privileged actions land in the append-only `audit_logs` (admin portal surfaces them).
- **Metrics / alerting (roadmap):** add a `/metrics` (Prometheus) endpoint and dashboards; alert on
  auth-failure spikes, 5xx rate, queue depth, and DB/Redis saturation.

---

## 9. Deploy-time security hardening

Execute the **`SECURITY_ARCHITECTURE.md` §12 checklist** at/around deploy. Highlights:
TLS + HSTS at the edge; **restrict/disable Swagger** (`/api/docs`) in prod; refresh cookie
`SameSite=Strict`; secrets in a manager (not `.env` files); WAF/DDoS in front (the app rate
limiter is the second line); enable RLS when multi-tenant; ship logs/audit to a SIEM; consider MFA
for admins; run `pnpm audit` (CI) + a pre-launch pen test.

---

## 10. Rollback & runbook

- **App rollback:** redeploy the previous image SHA (images are immutable). Because migrations are
  expand-then-contract, the prior app version runs against the new schema.
- **Migration rollback:** Prisma has no auto-down. To revert, ship a **new forward migration** that
  undoes the change; only restore from backup as a last resort. Therefore: deploy schema changes
  **ahead of** the code that requires them, and verify on staging first.
- **Data restore:** restore Postgres from the latest backup/PITR; Redis is rebuildable (cache +
  queues) — drain/replay queues if needed.
- **Incident quickcheck:** `GET /api/health/ready` (dependency health) → logs (`traceId`) →
  `audit_logs` (who did what) → queue depth in Redis.

---

## 11. Release checklist

- [ ] Green CI on the release commit (quality + e2e + docker).
- [ ] Secrets set in the target environment (JWT ≥32 chars, Razorpay, `SEED_SUPER_ADMIN_*`).
- [ ] `NEXT_PUBLIC_API_URL` baked for the target; `APP_WEB_URL` matches the web origin.
- [ ] Migration Job applied (migrate → SQL → seed) before/with rollout.
- [ ] TLS, HSTS, Swagger restriction, WAF verified.
- [ ] Probes + autoscaling + log/metric pipelines wired.
- [ ] Backups + restore drill verified; rollback plan confirmed.

---

## 12. Verification status (this phase)

Verified locally: **`pnpm build` ✅ · `pnpm test` (API 135 + web 12) ✅ · `pnpm lint` ✅**.
Docker images and the CI workflow are validated **in CI** (no Docker daemon on the build host) — the
`docker` job builds both images and the `e2e` job exercises the full stack. Compose files follow the
Compose spec (datastore healthchecks, `service_completed_successfully` ordering).

---

## ✅ Project complete

All **20 phases** are delivered: monorepo foundation → database → 14 backend domains → web client →
testing → security → deployment. Companion docs: `ARCHITECTURE_REVIEW.md`, `SYSTEM_SETUP.md`, the
per-domain `*_DOMAIN.md` set, `FRONTEND_ARCHITECTURE.md`, `TESTING_STRATEGY.md`,
`SECURITY_ARCHITECTURE.md`, and this guide. Recovery state lives in `PROJECT_PROGRESS.md`,
`CURRENT_STATE.md`, and `TODO.md`.
