# ADMIN_DOMAIN.md — Phase 16

Back-office capabilities: **user/role administration**, the **question review queue**, and **append-only audit logging**. (The admin *UI* is Phase 17; this phase is the API.)

**Status:** implemented & verified — API build ✅, **128 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. This completes the backend domains (3–16). e2e provided (needs live, seeded DB).

---

## 1. Structure (`apps/api/src/modules/admin/`)

```
admin.module.ts
admin.service.ts            # users, roles, review queue
audit.service.ts           # append-only audit log (record + queries)
audit.interceptor.ts       # records mutating admin requests
repositories/admin.repository.ts
admin.controller.ts · dto/
```
Shared schemas: [`@pharmacy/contracts/admin`](packages/contracts/src/admin/admin.ts).

## 2. Endpoints (`/api/v1/admin`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/audit-logs` | `audit:read` | List audit entries (filter entityType/actor) |
| GET | `/audit-logs/:entityType/:entityId` | `audit:read` | Entity history |
| GET | `/users` · `/users/:id` | `user:read` | List / get users (with roles) |
| POST | `/users/:id/roles` | `user:manage` | Assign a role |
| DELETE | `/users/:id/roles/:roleId` | `user:manage` | Remove a role |
| PATCH | `/users/:id/status` | `user:manage` | Activate / suspend / deactivate |
| GET | `/roles` | `user:manage` | List roles (for assignment) |
| GET | `/review-queue` | `question:review` | Questions awaiting review |

## 3. Audit logging

- **Append-only** — `audit_logs` rows are never updated/deleted (a Phase-2 DB trigger blocks it). `AuditService.record(...)` is **resilient**: a logging failure is caught and never breaks the audited request.
- **AuditInterceptor** ([audit.interceptor.ts](apps/api/src/modules/admin/audit.interceptor.ts)) — applied via `@UseInterceptors(AuditInterceptor)` on the admin controller; records every **mutating** (POST/PATCH/PUT/DELETE) request after success with actor, `METHOD path`, entity id, IP and user-agent. GETs are not audited.
- `AuditService` is exported so other domains can record domain-specific audit entries (e.g. question publish, payment capture) with before/after snapshots.

## 4. User & role administration

List/search users (with role names), assign/remove roles (validated), and set status (`ACTIVE`/`SUSPENDED`/`INACTIVE`). Suspended/inactive users are blocked at login (Identity, Phase 3) and on refresh. Role changes take effect on the user's next token refresh (access tokens embed roles/permissions with a 15-minute TTL).

## 5. Review queue

`GET /review-queue` surfaces questions in `REVIEW` status (oldest first) for reviewers/academic heads — the work list behind the question approval workflow (Phase 5).

## 6. Testing

- **Unit:** `admin.service.spec` — user→DTO role mapping, missing user → 404, **assign role validates existence** (→ 400), set status. (Suite: 128 green.)
- **e2e (`test/admin.e2e-spec.ts`, needs DB):** non-admin → 403, list users + **assign Reviewer role** (reflected in roles), review-queue + audit-log endpoints return paginated arrays.

## 7. Notes

- Audit `before/after` JSONB capture is supported by `AuditService.record`; wiring rich diffs into each domain's mutations is an incremental enhancement.
- Hard user deletion is intentionally absent — users are deactivated (status) and content authorship is preserved via soft refs (Phase 3 design).
- This is the final backend domain; Phase 17 builds the Next.js student + admin portals against these APIs (`FRONTEND_ARCHITECTURE.md`).
