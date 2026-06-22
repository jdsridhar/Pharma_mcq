# IDENTITY_DOMAIN.md — Phase 3

Authentication, account lifecycle, and RBAC for the platform. Built on the Phase-1 foundation (`ZodValidationPipe` + `createZodDto`, `PrismaService`, error envelope, global config) and the Phase-2 schema (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens`).

**Status:** implemented & verified — API build ✅, 22 unit tests ✅, lint 0/0 ✅. e2e provided (needs a live, seeded DB).

---

## 1. Structure (`apps/api/src/modules/identity/`)

```
identity.module.ts          # wires providers + 3 global guards (authn→authz)
controllers/
  auth.controller.ts        # register, login, refresh, logout, me
  account.controller.ts     # verify-email, resend, forgot/reset password
services/
  auth.service.ts           # use-case orchestrator
  token.service.ts          # JWT access + refresh rotation & reuse detection
  password.service.ts       # bcrypt hash/compare
  verification.service.ts   # opaque email/reset tokens (hashed, single-use)
  rbac.service.ts           # resolve effective roles+permissions; find system role
repositories/
  users.repository.ts       # user persistence + roles eager-load
  organization.repository.ts
guards/                     # JwtAuthGuard, PermissionsGuard, RolesGuard
decorators/                 # @Roles, @Permissions, @CurrentUser  (+ @Public in common/)
policies/policy.service.ts  # resource-level checks for later domains
ports/mailer.port.ts        # outbound email abstraction
adapters/log-mailer.service.ts  # dev transport (Phase 15 swaps SMTP/queue)
dto/                        # createZodDto wrappers over @pharmacy/contracts schemas
types/auth.types.ts         # JwtAccessPayload, JwtRefreshPayload, AuthenticatedUser
utils/duration.util.ts      # "15m"/"30d" → seconds (TTL ↔ cookie max-age)
```

Shared contracts live in `@pharmacy/contracts/identity/` (`auth.ts` schemas, `rbac.ts` catalog) so the web app validates with the exact same schemas.

## 2. Endpoints (`/api/v1`)

| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/auth/register` | public | `{name,email,password,mobile?}` | `AuthResult` (201) + refresh cookie |
| POST | `/auth/login` | public | `{email,password}` | `AuthResult` (200) + refresh cookie |
| POST | `/auth/refresh` | public (cookie) | `{refreshToken?}` | `AuthResult` (200) + rotated cookie |
| POST | `/auth/logout` | public (cookie) | — | 204 + cleared cookie |
| GET | `/auth/me` | **bearer** | — | `UserPublic` |
| POST | `/auth/verify-email` | public | `{token}` | `{verified:true}` |
| POST | `/auth/resend-verification` | **bearer** | — | `{sent:true}` (202) |
| POST | `/auth/forgot-password` | public | `{email}` | `{message}` (202, no enumeration) |
| POST | `/auth/reset-password` | public | `{token,password}` | `{reset:true}` (revokes all sessions) |

`AuthResult = { user: UserPublic, accessToken, tokenType:'Bearer', expiresIn }`. The refresh token is **never** in the JSON body — only in the `pmcq_refresh` httpOnly cookie.

## 3. Token strategy (§SEC-3)

- **Access token** — JWT signed with `JWT_ACCESS_SECRET`, TTL `JWT_ACCESS_TTL` (15m). Carries `sub,email,orgId,roles,permissions,type:'access'` so authorization needs **no DB hit** per request; staleness is bounded by the short TTL.
- **Refresh token** — JWT signed with a separate `JWT_REFRESH_SECRET`, TTL `JWT_REFRESH_TTL` (30d). Delivered as an httpOnly, `sameSite=lax`, `secure`-in-prod cookie.
- **Rotation + reuse detection**: every login starts a token *family*; each refresh rotates the token (old one revoked, linked to its successor). Only the **SHA-256 hash** of each refresh token is stored. Presenting an already-revoked token ⇒ theft/replay ⇒ **the whole family is revoked**. Password reset revokes *all* of a user's tokens.

## 4. RBAC

- **Catalog** (`@pharmacy/contracts/identity/rbac.ts`): permission keys `resource:action`; six system roles (Student → Super Admin) with additive permission bundles. Single source of truth for the seeder *and* the web UI.
- **Guards (global, secure-by-default):**
  1. `JwtAuthGuard` — verifies the bearer token, sets `req.user`; bypassed by `@Public()`.
  2. `PermissionsGuard` — `@Permissions('question:approve', …)` requires **all** listed keys.
  3. `RolesGuard` — `@Roles('Admin', …)` requires **any** listed role.
  Anything not marked `@Public()` requires authentication.
- **Decorators:** `@Public()` (in `common/`), `@Roles()`, `@Permissions()`, `@CurrentUser()`.
- **PolicyService** (exported): resource-level checks (`isOwner`, `assertOwnerOrPermission`) for "author edits only their own draft" type rules in later domains — guards answer "can this role reach this route?", policies answer "may this user act on *this* record?".

## 5. Security decisions

- Passwords: bcrypt at `BCRYPT_ROUNDS` (≥10, default 12). Login compares against a throwaway hash when the user is absent to keep timing uniform.
- No account enumeration on `forgot-password` (always 202) or `login` (generic "invalid email or password").
- Email-verification & reset tokens are random 32-byte values stored only as hashes, single-use, with TTLs (24h / 1h).
- Refresh cookie is httpOnly (no JS access), `secure` in production, `sameSite=lax`; `helmet` + CORS (`credentials:true`, origin = `APP_WEB_URL`) from Phase 1.
- `audit_logs` are append-only at the DB level (Phase-2 trigger); the audit *write path* is wired in Phase 16.

## 6. Mailer port

The domain depends on `MailerPort`, bound to `LogMailer` (logs the verification/reset link) for development. Phase 15 re-binds `MAILER` to an SMTP/queue adapter — no Identity code changes. This is ports-and-adapters, not a mock.

## 7. Seeding

`prisma/seeders/rbac.seeder.ts` upserts the permission catalog and reconciles each system role's grants. `prisma/seeders/admin.seeder.ts` seeds a Super Admin — required env in prod (`SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`), flagged dev fallback otherwise. Both are orchestrated (idempotently) from `prisma/seed.ts`.

## 8. Testing

- **Unit (run anywhere, no DB):** `token.service` (sign, persist-hash, rotate, **reuse→family revoke**, unknown token), `password.service` (real bcrypt), `permissions.guard`, `policy.service`, `duration.util` → **22 tests green**.
- **e2e (`test/auth.e2e-spec.ts`, needs live+seeded DB):** weak-password 400 → register 201 → duplicate 409 → login + cookie → bad creds 401 → `/me` with/without bearer → cookie refresh rotation.

## 9. Run it

```bash
pnpm docker:up                       # Postgres + Redis
pnpm db:migrate:deploy && pnpm db:sql # schema + operational SQL
pnpm db:seed                         # org + RBAC + (dev) super admin
pnpm --filter @pharmacy/api dev      # API at /api/v1, Swagger at /api/docs
```

## 10. Notes / lint config

`@typescript-eslint/consistent-type-imports` is **off for the API package only**: NestJS DI requires constructor-param classes to be *value* imports so `emitDecoratorMetadata` emits `design:paramtypes`; without type-aware linting the rule false-flags DI providers and would break injection if auto-fixed. Non-Nest packages keep the rule on.
