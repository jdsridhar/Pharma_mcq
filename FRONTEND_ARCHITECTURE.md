# FRONTEND_ARCHITECTURE.md — Phase 17

> The Next.js web client (`apps/web`) for the Pharmacy MCQ Platform: student portal + admin
> shell, built on the completed API (Phases 3–16). Consumes the API purely through
> `@pharmacy/contracts` types. No SSR data-fetching — every data screen is a client component
> driven by TanStack Query, so the production build needs neither the API nor a database.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 3 ·
TanStack Query 5 (server state) · Zustand 5 (auth/session state) · Zod (shared schemas).

---

## 1. Directory map

```
apps/web/src/
├─ app/
│  ├─ layout.tsx                  # root layout; mounts <Providers>
│  ├─ providers.tsx               # QueryClientProvider + <AuthBootstrap/>
│  ├─ globals.css                 # Tailwind layers
│  ├─ page.tsx                    # public landing (hero + CTAs + SystemStatus)
│  ├─ login/page.tsx              # public — email/password sign-in
│  ├─ register/page.tsx           # public — account creation
│  └─ (app)/                      # AUTHENTICATED route group
│     ├─ layout.tsx               # client auth guard → <AppShell>
│     ├─ dashboard/page.tsx       # overview stats + focus areas + revision-due
│     ├─ practice/page.tsx        # start a session + recent sessions
│     ├─ practice/[id]/page.tsx   # question player (all 6 types) + summary
│     ├─ mock-tests/page.tsx      # published tests list + start
│     ├─ mock-tests/sessions/[id]/page.tsx  # timed runner + result
│     ├─ revision/page.tsx        # spaced-repetition due list + review
│     ├─ analytics/page.tsx       # per-topic mastery table + recompute
│     ├─ plans/page.tsx           # plan catalog + subscribe + entitlements
│     └─ admin/                   # permission-gated admin shell
│        ├─ questions/page.tsx    # editorial review queue
│        ├─ users/page.tsx        # user/role administration
│        └─ audit/page.tsx        # append-only audit log
├─ components/
│  ├─ ui.tsx                      # component kit: cn, Button, Input, Select, Field,
│  │                             #   Card, PageHeader, Badge, Spinner, Alert
│  ├─ app-shell.tsx              # role-aware sidebar + topbar (sign out)
│  ├─ auth-bootstrap.tsx         # runs auth-store bootstrap() once on mount
│  └─ system-status.tsx         # /health probe widget (landing)
├─ lib/
│  ├─ env.ts                     # clientEnv.NEXT_PUBLIC_API_URL (default :4000/api)
│  ├─ api-client.ts             # apiFetch<T>, ApiClientError, single-flight refresh
│  └─ api/
│     ├─ token.ts               # in-memory access-token singleton
│     └─ endpoints.ts           # typed API groups (auth/analytics/practice/…)
└─ store/
   └─ auth-store.ts             # Zustand: user, status, login/register/logout/bootstrap
```

---

## 2. API client (`lib/api-client.ts` + `lib/api/`)

A thin typed wrapper over `fetch` — **not** a heavyweight SDK.

- **Base URL:** `clientEnv.NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api`). Endpoint
  groups prefix their paths with `/v1` (e.g. `/v1/practice/sessions`); `/health` stays at the
  unversioned base so the landing-page probe keeps working.
- **`apiFetch<T>(path, init?, options?)`:**
  - always sends `credentials: 'include'` so the httpOnly **refresh cookie** travels;
  - attaches `Authorization: Bearer <access>` from the in-memory token when present;
  - parses the API error envelope `{ error: { code, message, details?, traceId? } }` into a
    thrown **`ApiClientError`** (carries `status`, `code`, `message`, `details`); success bodies
    are returned as the raw DTO / `Paginated<T>` (`{ items, meta }`);
  - **401 → silent refresh:** on a 401 it calls `POST /v1/auth/refresh` exactly once through a
    **single-flight** promise (concurrent 401s share one refresh), stores the new access token,
    and retries the original request once. A second failure surfaces the error and the auth store
    transitions to anonymous.
- **`lib/api/token.ts`:** access token lives in a module-level variable (`getAccessToken` /
  `setAccessToken`) — **never** in `localStorage`/`sessionStorage`. It dies with the tab; the
  refresh cookie re-establishes the session on reload.
- **`lib/api/endpoints.ts`:** one typed object per domain — `authApi`, `analyticsApi`,
  `recommendationApi`, `practiceApi`, `mockTestApi`, `revisionApi`, `commerceApi`,
  `notificationApi`, `adminApi`. Every function's request/response types come straight from
  `@pharmacy/contracts`, so client and server cannot drift.

---

## 3. State management — clear split

| Concern | Tool | Where |
|---|---|---|
| **Server/cache state** (questions, sessions, mastery, plans, users, audit…) | TanStack Query | per-page `useQuery`/`useMutation`; mutations invalidate the relevant query keys |
| **Session/auth state** (current `UserPublic`, `status`, permissions) | Zustand | `store/auth-store.ts` |
| **Ephemeral UI state** (current question index, answer drafts, timers) | React `useState`/`useRef` | inside the page component |

**Auth store (`store/auth-store.ts`).** Holds `user: UserPublic | null` and
`status: 'loading' | 'authenticated' | 'anonymous'`. Actions: `login`, `register`, `logout`,
`bootstrap()`, plus selectors `hasPermission(p)` / `hasRole(r)` that read the roles/permissions
embedded in the access token's user payload.

- `bootstrap()` runs once via `<AuthBootstrap/>` (mounted inside `providers.tsx`): it tries
  `authApi.me()`; if that 401s, `apiFetch`'s silent refresh kicks in, and only a hard failure
  resolves to `anonymous`. This makes a page refresh feel logged-in without persisting tokens.

---

## 4. Routing, guards & RBAC in the UI

- **Public routes:** `/`, `/login`, `/register`.
- **`(app)` route group:** a client `layout.tsx` guard — `loading` → `<Spinner/>`; `anonymous`
  → `router.replace('/login')`; `authenticated` → renders `<AppShell>` (sidebar + topbar).
- **`AppShell`** builds the student nav statically and filters the **admin nav by permission**
  using `hasPermission(PERMISSIONS.QUESTION_READ | USER_READ | AUDIT_READ)` — admins see an
  "Administration" section; students never see it.
- **Security note:** UI gating is **cosmetic only**. Every admin endpoint is enforced
  server-side by the API's guards; hiding a link never substitutes for that. Permission keys and
  role names come from `@pharmacy/contracts` (`PERMISSIONS`, `SystemRole`) — single source of truth.

---

## 5. Assessment UX — the question player

Two runners share a design but differ by domain rules:

**Practice (`practice/[id]`) — formative, instant feedback.**
- One question at a time; a progress bar tracks answered count.
- Renders the correct input per `questionType` (all six): SINGLE/MULTI/ASSERTION_REASON →
  option buttons (radio vs checkbox semantics), TRUE_FALSE → two toggles, NUMERIC → number
  input, MATCHING → a `<select>` per left-hand prompt over the shuffled candidates.
- On submit, the API returns `PracticeAnswerResultDto` (`isCorrect`, `correctOptionIds`,
  `explanation`); the option list then **locks** and colours correct/incorrect, and the
  explanation panel appears. "Finish & score" calls `/complete` and shows the summary
  (score, accuracy, per-node breakdown) with a deep link into Revision.

**Mock test (`mock-tests/sessions/[id]`) — summative, timed, ranked.**
- A **countdown** derived from the server-authoritative `expiresAt`; at zero it auto-submits
  (guarded by a `submitted` ref so it fires once).
- A question **navigator** grid (answered cells filled) lets users jump around; navigation and
  jumps **save the current answer first** (`POST /answers`, keyed by `snapshotId`).
- **No per-answer feedback** (it would leak the key mid-exam). Submit → `TestResultDto`:
  score/maxScore, accuracy, correct/wrong/skipped, and **rank / cohort size / percentile**.

**No-answer-leak (defence in depth):** the API already strips `isCorrect`/`answerSpec`/
`explanation` from served questions; the client only ever reveals correctness *after* an answer
in practice, and never during a timed test.

---

## 6. Design system & accessibility

- **`components/ui.tsx`** — a tiny, dependency-free kit using a local `cn()` class-merger:
  `Button` (primary/secondary/ghost/danger), `Input`, `Select`, `Field` (label + control +
  hint/error), `Card`, `PageHeader`, `Badge` (green/slate/amber/red/blue), `Spinner`, `Alert`.
- **Brand:** Tailwind `brand` green scale (`50 #eef7f1 … 700 #0a6438`).
- **Responsive:** the shell is a single column on mobile, `15rem | 1fr` grid on `md+`; content
  is capped at `max-w-5xl`.
- **A11y:** semantic landmarks (`<aside>`/`<header>`/`<main>`/`<nav>`), labelled form controls
  via `Field`/`aria-label`, `<button type="button">` for non-submit actions, focus-visible
  rings, and `alt` text on question media.

---

## 7. Verification

All green (no DB/API required — client components + React Query):

| Check | Command | Result |
|---|---|---|
| Types | `corepack pnpm --filter @pharmacy/web typecheck` | ✅ `tsc --noEmit` clean |
| Lint | `corepack pnpm --filter @pharmacy/web lint` | ✅ `eslint .` 0 errors |
| Build | `corepack pnpm --filter @pharmacy/web build` | ✅ 15 routes compiled |

Build output: 13 statically prerendered routes + 2 dynamic (`/practice/[id]`,
`/mock-tests/sessions/[id]`); shared First-Load JS ≈ 102 kB.

Notes:
- `next-env.d.ts` is generated by Next and excluded from ESLint (it emits a triple-slash path
  reference our base config rejects) — see `apps/web/eslint.config.mjs`.
- `<img>` is used for question media (arbitrary external/S3 URLs, not the Next image loader); the
  `@next/next/no-img-element` warning is suppressed at those two call sites by intent.
- `next build` prints "Next.js plugin not detected in your ESLint configuration" — benign: lint
  runs through our shared flat config (`@pharmacy/eslint-config/next`) which already loads
  `@next/eslint-plugin-next`; the standalone `pnpm lint` step is the authority.

---

## 8. Conventions for future screens

1. New data screen = a `'use client'` page using `useQuery`/`useMutation` against a typed
   function in `lib/api/endpoints.ts` (add the function there, never inline a raw path/`fetch`).
2. Import DTO **types** from `@pharmacy/contracts`; reuse its Zod schemas for form validation.
3. Compose from `components/ui.tsx`; don't introduce a UI dependency without cause.
4. Mutations invalidate the query keys they affect (e.g. recompute → `['mastery']`,`['overview']`).
5. Gate admin UI with `hasPermission(...)` for UX, but rely on the API for actual authorization.
6. Money is integer **minor units** + currency — format only at render (`Intl.NumberFormat`).

---

## 9. Deferred / out of scope (candidates for later)

- Admin **authoring** UIs (create/edit questions, knowledge-graph & exam-blueprint editors):
  the API exists; only read/review screens are wired here. The list/table + `endpoints.ts`
  pattern extends to them directly.
- Notification bell/feed surfacing `notificationApi` (endpoints ready; no UI yet).
- Study-plan generator screen (`recommendationApi.studyPlan`) and recommendation feed page.
- Optimistic updates and richer empty/skeleton states; client-side Zod validation on auth forms.
- E2E/component tests (Playwright/Testing Library) — folded into **Phase 18 (Testing)**.
```
