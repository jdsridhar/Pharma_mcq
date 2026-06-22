# SYSTEM_SETUP.md — Phase 1: Project Foundation

> Status: ✅ Foundation built and **verified** (install, build, Prisma generate, unit tests, web typecheck all green). Container runtime steps (Docker) are authored but could not be executed on the build machine (Docker not installed) — see §9.

---

## 1. What Phase 1 delivers

A production-grade **pnpm + Turborepo monorepo** with:

- **`apps/api`** — NestJS 10 modular monolith: validated config, Prisma + Redis infra, structured (pino) logging, global Zod validation, canonical error envelope, Swagger, and liveness/readiness health probes.
- **`apps/web`** — Next.js 15 (App Router) + Tailwind + TanStack Query + Zustand, with a typed API client and a live API-status component.
- **Shared packages** — `@pharmacy/contracts` (FE/BE types + Zod), `@pharmacy/config` (validated server env), `@pharmacy/eslint-config` (shared flat config).
- **Infra** — `docker-compose.yml` (Postgres, Redis, MinIO, Mailpit) + per-app multi-stage Dockerfiles.

## 2. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20.11 (LTS 22 recommended) | Build machine verified on Node 24.15 |
| pnpm | 9.15.4 (pinned) | `corepack enable` activates it from `packageManager` |
| Docker Desktop | latest | Required to run the datastores/full stack |
| Git | any recent | repo not yet initialised — see §10 |

## 3. Repository structure

```
.
├─ apps/
│  ├─ api/                 NestJS API
│  │  ├─ prisma/           schema.prisma (baseline) + seed.ts
│  │  ├─ src/
│  │  │  ├─ config/        AppConfigModule (validated env via @pharmacy/config)
│  │  │  ├─ infra/         prisma/ + redis/ (global modules)
│  │  │  ├─ common/        filters/, health/, validation/ (ZodValidationPipe, createZodDto)
│  │  │  ├─ modules/       health/ (first feature module)
│  │  │  ├─ app.module.ts
│  │  │  └─ main.ts        bootstrap: helmet, cors, /api/v1, swagger, shutdown hooks
│  │  └─ test/             e2e (jest)
│  └─ web/                 Next.js App Router
│     └─ src/
│        ├─ app/           layout, page, providers (RQ + devtools), globals.css
│        ├─ components/    system-status.tsx
│        ├─ lib/           api-client, query-client, env (zod)
│        └─ store/         zustand ui-store
├─ packages/
│  ├─ contracts/           @pharmacy/contracts
│  ├─ config/              @pharmacy/config
│  └─ eslint-config/       @pharmacy/eslint-config
├─ docker-compose.yml      postgres · redis · minio · mailpit · api · web
├─ turbo.json · pnpm-workspace.yaml · tsconfig.base.json · .env.example
└─ ARCHITECTURE_REVIEW.md · PROJECT_PROGRESS.md · TODO.md · CURRENT_STATE.md
```

## 4. First-time setup

```bash
corepack enable
cp .env.example .env          # Windows: copy .env.example .env
pnpm install
```

## 5. Environment

All server env is validated by `@pharmacy/config` (Zod) at startup — the API **fails fast** with a readable list if anything is missing/invalid. `.env.example` documents every variable and is the contract shared with `docker-compose.yml`. Production enforces strong (≥32-char) JWT secrets and Razorpay credentials.

## 6. Running

**Mode A — hybrid (recommended for dev):** datastores in Docker, apps hot-reloading on the host.
```bash
pnpm docker:up                       # postgres, redis, minio, mailpit (NOT api/web)
pnpm db:migrate                      # create/apply initial migration (needs DB up)
pnpm db:seed                         # default organization
pnpm dev                             # turbo: api :4000 + web :3000
```

**Mode B — full containers:**
```bash
pnpm docker:up                       # builds & runs everything incl. api + web
```

Endpoints: web `http://localhost:3000` · API `http://localhost:4000/api` · Swagger `…/api/docs` · health `…/api/health` & `…/api/health/ready` · Mailpit `:8025` · MinIO console `:9001`.

## 7. Database workflow

```bash
pnpm db:generate          # prisma generate (client)
pnpm db:migrate           # prisma migrate dev (needs a running DB)
pnpm db:migrate:deploy    # prisma migrate deploy (CI/prod)
pnpm db:seed              # idempotent seeders
pnpm db:studio            # Prisma Studio
```
> Phase 1 ships a **baseline** schema (`Organization` only). The full domain schema + initial migration are produced in **Phase 2**. Creating the first migration requires a running Postgres (`pnpm docker:up`).

## 8. Script reference (root)

| Script | Action |
|---|---|
| `pnpm dev` / `build` / `lint` / `typecheck` / `test` | Turbo fan-out across workspaces |
| `pnpm format` / `format:check` | Prettier |
| `pnpm db:*` | Prisma (delegated to API) |
| `pnpm docker:up` / `docker:down` / `docker:logs` | Compose lifecycle |

## 9. Verification status (run on the build machine)

| Step | Command | Result |
|---|---|---|
| Install | `pnpm install` | ✅ 6 projects, exit 0 (2m41s) |
| Build packages | `pnpm --filter @pharmacy/config --filter @pharmacy/contracts build` | ✅ |
| Prisma client | `prisma generate` | ✅ client v6.19.3 |
| API compile | `pnpm --filter @pharmacy/api build` (`nest build`) | ✅ |
| API unit tests | `pnpm --filter @pharmacy/api test` | ✅ 2/2 |
| Web typecheck | `pnpm --filter @pharmacy/web typecheck` | ✅ |

## 10. Known caveats / not yet exercised here

1. **Docker** is not installed on the build machine → `docker-compose.yml` and Dockerfiles are authored to spec but **not yet run**. Validate with `pnpm docker:up` on a machine with Docker Desktop. The Dockerfiles assume `pnpm-lock.yaml` exists (it does, generated by install) for `--frozen-lockfile`.
2. **Initial Prisma migration** not created (needs a live DB). Run `pnpm db:migrate` once Postgres is up; Phase 2 owns the full schema + migrations.
3. **`next build`** (full production build) not run here; the app **typechecks** clean. Validate with `pnpm --filter @pharmacy/web build`.
4. **Git** repo not initialised. To start version control: `git init && git add -A && git commit -m "Phase 0–1: foundation"`.
5. Prisma prints a deprecation notice for `package.json#prisma` (removed in Prisma 7); migrate to `prisma.config.ts` later (tracked for Phase 20 polish).
6. Optional `husky` git hooks are referenced in `prepare` but not installed (it no-ops via `|| true`).

## 11. Conventions established (enforced from here on)

- **UUID v7** primary keys (`@default(uuid(7))`); `Timestamptz` timestamps.
- Internal packages compile to **CommonJS** so NestJS (CJS) and Next (bundler) both consume them.
- **Zod at the boundary** via `ZodValidationPipe` + `createZodDto`; Prisma types internally.
- Canonical error envelope `{ error: { code, message, details, traceId } }` (`@pharmacy/contracts`).
- Multi-tenant-ready: `Organization` baseline; `organization_id` added to tenant-scoped tables in Phase 2 (§7-A).
- Structured logging (pino), CORS locked to `APP_WEB_URL`, helmet on, graceful shutdown hooks.

## 12. Next

**Phase 2 — Database Design:** full schema (all domains), relationships, indexes, constraints, RLS scaffolding, and the initial migration. Deliverables: `DATABASE_ARCHITECTURE.md`, `DATABASE_ERD.md`, `DATABASE_INDEXING.md`.
