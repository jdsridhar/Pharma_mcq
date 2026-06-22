# SECURITY_ARCHITECTURE.md — Phase 19

> The platform's security posture **as implemented**, mapped to the OWASP Top-10 (2021), plus the
> production hardening roadmap. Every control below points at real code; nothing here is
> aspirational unless explicitly marked **(roadmap)**.

**Status (2026-06-06):** All controls below are implemented and covered by the test suites
(**API 135 unit tests / 33 suites**, incl. the new `ThrottlerGuard`). New this phase: a
Redis-backed, production-gated **rate limiter** wired globally + tightened on `/auth/*`.

---

## 1. Security model & principles

- **Secure by default.** Every route requires a valid access token unless explicitly `@Public()`
  (`apps/api/src/common/decorators/public.decorator.ts`). Authorization guards are global, not
  opt-in.
- **Defense in depth.** Validation → authN → authZ → ownership policy → query-level scoping, each
  an independent layer.
- **Least privilege.** Fine-grained `PERMISSIONS` catalog + 6 `SystemRole`s (in
  `@pharmacy/contracts`); access tokens carry exactly the caller's roles + permissions.
- **Fail safe / fail fast.** Env is validated at boot (process won't start misconfigured); auth
  errors deny; the one deliberate exception is the rate limiter, which **fails open** so a Redis
  outage can't lock everyone out.
- **No secrets in code.** All secrets come from the validated environment (`@pharmacy/config`).

---

## 2. Authentication  *(`apps/api/src/modules/identity`)*

**Tokens** (`services/token.service.ts`):
- **Access JWT** — 15 min (`JWT_ACCESS_TTL`), signed with `JWT_ACCESS_SECRET`, carries
  `sub/email/orgId/roles/permissions/type:'access'`. Short-lived so revoked privileges expire fast.
- **Refresh JWT** — 30 days (`JWT_REFRESH_TTL`), **separate secret** (`JWT_REFRESH_SECRET`),
  delivered only via an **httpOnly cookie**. Stored server-side **as a SHA-256 hash** (never
  plaintext) in `refresh_tokens`.
- **Family rotation + reuse detection:** each login starts a token *family*; every refresh
  **rotates** (old token revoked, linked to its successor). Presenting an already-revoked refresh
  token ⇒ theft/replay ⇒ **the entire family is revoked** (`rotateRefreshToken` →
  `revokeFamily`). Expiry is re-checked on every rotation.
- **Session invalidation:** password reset/change revokes **all** of a user's refresh tokens
  (`revokeAllForUser`); `refresh` re-loads the user, rejects if no longer active, and **re-resolves
  roles/permissions** so role changes take effect within one access-token lifetime.

**Passwords** (`services/password.service.ts`): **bcrypt**, cost from `BCRYPT_ROUNDS`
(10–15, default **12**). Password strength enforced by Zod at the contract boundary.

**Anti-enumeration / anti-timing** (`services/auth.service.ts`):
- Login returns a single generic `401 "Invalid email or password"` for both unknown email and
  wrong password, and **compares against a throwaway bcrypt hash when the user is missing** to keep
  response timing uniform.
- `forgotPassword` **always succeeds** regardless of whether the email exists (mail is sent only if
  it does).

**Account state:** `SUSPENDED`/`INACTIVE` accounts are refused at login and refresh (`403`).

**Refresh cookie flags** (`controllers/auth.controller.ts`): `httpOnly: true`,
`secure: NODE_ENV==='production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge = refresh TTL`.

---

## 3. Authorization (RBAC + ownership)

**Three global guards**, bound in authN→authZ order in `identity.module.ts`:
`JwtAuthGuard → PermissionsGuard → RolesGuard`.
- `JwtAuthGuard` verifies the bearer token, rejects wrong-type tokens, attaches `req.user`.
- `PermissionsGuard` enforces `@Permissions(...)`; `RolesGuard` enforces `@Roles(...)`.
- `@Public()` is the **only** way to open a route — visible and greppable.
- `@CurrentUser()` injects the principal; **resource ownership** is checked by `PolicyService`
  (`policies/policy.service.ts`) for "can this user act on *this* row" decisions.

**Answer-leak prevention (domain authZ):** served practice/assessment questions are stripped of
`isCorrect` / `answerSpec` / `explanation`; correctness is returned only *after* an answer is
submitted (practice) or never to the client mid-exam (assessment). Graded attempts read **frozen
JSONB snapshots**, not the live (editable) question.

---

## 4. Input validation & output safety

- **Validation:** a single global `ZodValidationPipe` (`common/validation/`) validates every
  body/query/param against the shared `@pharmacy/contracts` schemas — one source of truth for
  client + server, eliminating drift.
- **Canonical errors:** `AllExceptionsFilter` (`common/filters/`) converts everything to
  `{ error: { code, message, details, traceId } }`. **5xx are logged with stack server-side only;
  stacks/internal messages are never sent to clients.** Status→code mapping includes
  `429 → RATE_LIMITED`.
- **SQL injection:** all data access is via **Prisma** (parameterized). Raw SQL exists only in
  reviewed migration/`prisma/sql/` files (trigram/FTS/partitioning), never built from user input.
- **Output:** responses are JSON DTOs; no server-side HTML templating, so no template injection.
  The web client renders via React (auto-escaping); `dangerouslySetInnerHTML` is not used.

---

## 5. Rate limiting & abuse prevention  *(new this phase)*

`common/throttler/throttler.guard.ts` — a **distributed fixed-window** limiter backed by the
shared Redis connection, bound globally via `APP_GUARD` in `app.module.ts`.

- **Keyed by client IP + route handler**, so one noisy client can't starve others.
- **Defaults** from `RATE_LIMIT_LIMIT` / `RATE_LIMIT_TTL` (120 req / 60 s). Per-route override with
  `@Throttle({ limit, ttl })`; bypass with `@SkipThrottle()`.
- **`/auth/register|login|refresh` tightened to 10 req / 60 s / IP** — brute-force/credential-
  stuffing throttle. **Health probes are `@SkipThrottle()`**.
- **Production-gated:** a no-op when `NODE_ENV !== 'production'`, so local dev and the e2e suite
  aren't throttled. **Fails open** on Redis errors (logged) — availability over strict enforcement.
- On breach: `429` + `Retry-After` header, surfaced through the standard `RATE_LIMITED` envelope.
- Covered by `throttler.guard.spec.ts` (allow/deny boundary, header, skip, override, fail-open,
  non-prod no-op).

> App-level limiting complements, but does not replace, **edge WAF/DDoS** protection — see §11.

---

## 6. Transport & HTTP headers  *(`apps/api/src/main.ts`)*

- **Helmet** sets secure response headers (HSTS, X-Content-Type-Options, frame options, etc.).
- **CORS** is locked to `APP_WEB_URL` with `credentials: true` — not a wildcard.
- **TLS** terminates at the edge/ingress in production (HTTPS only, HSTS) — **(roadmap, Phase 20)**.
- Swagger is served at `/api/docs`; **restrict or disable in production** — **(roadmap)**.

---

## 7. Secrets & configuration  *(`packages/config/src/index.ts`)*

- **Fail-fast validation:** `loadServerEnv()` Zod-parses the environment at startup and aborts with
  a readable aggregated error on misconfiguration.
- **Production hardening enforced in-schema:** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` must be
  **≥32 chars and non-placeholder**; Razorpay key+webhook secrets are **required** in production.
- **Separate access/refresh secrets**; secrets are read only from env, never committed.
- **Seed safety:** the dev super-admin (`admin@pharmacy-mcq.local`) is gated to non-production;
  production requires `SEED_SUPER_ADMIN_EMAIL` / `SEED_SUPER_ADMIN_PASSWORD`.

---

## 8. Data protection

- **At rest:** passwords = bcrypt; refresh tokens = SHA-256 hashes; money = integer **minor units**
  (no float drift). Disk/DB/object-store encryption is provided by the managed infra — **(roadmap,
  Phase 20)**.
- **Integrity:** graded assessment attempts store **immutable JSONB snapshots**; `audit_logs` is
  **append-only** (enforced by a DB trigger) and also written via an interceptor.
- **Tenancy:** `organizationId` is carried on rows and in the access token (single-tenant runtime
  today), making **row-level security (RLS)** a configuration step, not a refactor — **(roadmap)**.
- **PII:** minimal (name, email, optional mobile); transported over TLS, access-controlled by RBAC.

---

## 9. Logging, auditing & monitoring  *(`app.module.ts` pino config)*

- **Structured logging** via `nestjs-pino` with **redaction of `req.headers.authorization` and
  `req.headers.cookie`** — tokens never hit the logs.
- **Audit trail:** privileged/admin actions are recorded in the append-only `audit_logs`
  (actor, action, entity, IP, timestamp), surfaced read-only in the admin portal.
- **Correlation:** each response carries a `traceId`; 5xx are logged with stack + method/url.
- **Alerting / SIEM shipping** — **(roadmap, Phase 20)**.

---

## 10. OWASP Top-10 (2021) → controls

| # | Category | Controls in this codebase | Status |
|---|---|---|---|
| **A01** | Broken Access Control | 3 global guards secure-by-default; `@Public` explicit opt-out; `PolicyService` ownership; answer-leak prevention; snapshot reads | ✅ Implemented |
| **A02** | Cryptographic Failures | bcrypt(12) passwords; SHA-256 refresh-token hashing; HMAC-SHA256 webhooks; separate JWT secrets; TLS at edge | ✅ (TLS at deploy) |
| **A03** | Injection | Prisma parameterized queries; global Zod validation; raw SQL only in vetted files; no HTML templating | ✅ Implemented |
| **A04** | Insecure Design | Layered design; immutable snapshots; refresh **reuse detection**; fail-safe defaults; golden-rule data model | ✅ Implemented |
| **A05** | Security Misconfiguration | Helmet; CORS allowlist; fail-fast env + prod secret-strength checks; no stack leakage | ✅ (restrict Swagger — roadmap) |
| **A06** | Vulnerable/Outdated Components | pnpm lockfile + integrity; minimal deps (no payment SDK — `fetch`+`crypto`); `pnpm audit` in CI | ◑ CI gate in Phase 20 |
| **A07** | Identification & Auth Failures | Zod password policy; generic login errors + anti-enumeration/timing; auth **rate limiting**; rotation + reuse detection; session revocation on password change | ✅ Implemented |
| **A08** | Software & Data Integrity Failures | **HMAC + `timingSafeEqual`** webhook verification over raw body; immutable snapshots; append-only audit; lockfile | ✅ Implemented |
| **A09** | Logging & Monitoring Failures | pino structured logs w/ secret redaction; append-only audit log; traceId correlation | ✅ (alerting — roadmap) |
| **A10** | SSRF | No user-controlled outbound URLs; egress only to fixed Razorpay API + configured SMTP/S3 | ✅ Low exposure |

---

## 11. Threats considered & notes

- **CSRF:** API authorization uses **Bearer tokens** (not cookies) → API calls are not CSRF-able.
  The only cookie is the **httpOnly, SameSite=Lax** refresh token; `/auth/refresh` is a POST that
  returns a new access token in the body. **Recommended hardening:** `SameSite=Strict` for the
  refresh cookie in production, and a CSRF token if cookie-based API auth is ever introduced.
- **Brute force / credential stuffing:** mitigated by the auth-route rate limit (§5) + bcrypt cost
  + generic errors. Consider progressive backoff / account lockout for high-risk deployments.
- **Token theft:** short access TTL + refresh rotation with reuse detection bounds the blast radius;
  httpOnly cookie keeps refresh tokens out of JS (XSS can't read them).
- **Account enumeration:** closed on login + forgot-password (§2).

---

## 12. Production hardening checklist  *(executed in Phase 20 — Deployment)*

- [ ] Terminate **TLS** at the edge; enforce HTTPS + **HSTS**; redirect HTTP→HTTPS.
- [ ] Put a **WAF / DDoS** layer in front (Cloudflare/ALB); the app limiter is the second line.
- [ ] **Restrict Swagger** (`/api/docs`) in production — disable or auth-gate.
- [ ] Move secrets to a **secrets manager** (not raw env files); rotate JWT secrets on a schedule.
- [ ] Set strong, unique `JWT_*` secrets, real Razorpay creds, `SEED_SUPER_ADMIN_*`.
- [ ] Set the refresh cookie to **`SameSite=Strict`**; verify `secure` is on (prod default).
- [ ] Enable **RLS** policies keyed on `organizationId` when multi-tenant is activated.
- [ ] Wire **`pnpm audit`** + dependency scanning (Dependabot/Renovate) + SAST into CI.
- [ ] Ship logs/audit to a **SIEM**; add alerting on auth failures + 5xx spikes.
- [ ] Consider **MFA** for admin/super-admin accounts; tune **CSP** via Helmet.
- [ ] Independent **pen test** before public launch.

---

## 13. Verification

`corepack pnpm --filter @pharmacy/api build|test|lint` — **build ✅ · 135 tests / 33 suites ✅ ·
lint ✅**. The web app is unchanged this phase. Auth-flow + RBAC enforcement are additionally
exercised by the deferred e2e suites (`apps/api/test/auth.e2e-spec.ts` et al.) once a live stack is
available — see `TESTING_STRATEGY.md`.
