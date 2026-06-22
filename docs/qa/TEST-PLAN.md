# QA Test Plan — "Testing Team": every page × every role, as a real user

> **Status:** PLAN ONLY. Nothing in here runs until the user says **continue**.
> **Goal:** a virtual QA team where each member is a real user of a specific role, exercising every
> page in realistic, real-world journeys — proving both that each role *can do its job* and that it
> *cannot* reach what it shouldn't (RBAC), across UI and API.

---

## 1. Objective & success criteria

- **Coverage:** every page (27) is exercised by every role that should reach it, and *attempted* by
  roles that should be denied.
- **Realism:** testers behave like real users — log in, navigate, fill forms, submit, read results —
  not just hit endpoints. Cross-role journeys mirror actual workflows.
- **Rigor:** every reported defect is independently reproduced (adversarial verify) before it counts.
- **Deliverable:** a pass/fail matrix (page × role), a confirmed-bug list with severity + repro +
  screenshots, and a coverage report. No silent gaps.

## 2. System under test

| Thing | Value |
|---|---|
| Web app | `http://localhost:3000` (Next.js dev, currently UP) |
| API | `http://localhost:4000/api/v1` (NestJS, currently UP) |
| Login page | `/login` (one-click demo sign-in buttons exist) |
| Demo accounts | `<role>@demo.local` / `Demo@12345` (student, author, reviewer, academic, admin, superadmin) |
| Platform super admin | `admin@pharmacy-mcq.local` / `ChangeMe_Admin1` |
| Existing coverage | API e2e (supertest) in `apps/api/test/*.e2e-spec.ts` — backend only, **no per-role UI tests** |

## 3. The testing team (agent personas)

Each persona is an autonomous tester that authenticates as one principal and drives the app as that
user. Eight personas = the six system roles + two tenant contexts:

| Persona | Principal | Represents |
|---|---|---|
| **QA‑Student** | student@demo.local | Learner (read/practice/test only) |
| **QA‑Author** | author@demo.local | Content Author (draft questions) |
| **QA‑Reviewer** | reviewer@demo.local | Reviewer (review/approve) |
| **QA‑AcademicHead** | academic@demo.local | Academic Head (publish + structure: knowledge/curriculum/exam/track/mock) |
| **QA‑Admin** | admin@demo.local | Admin (users, plans, audit, rec-rules) |
| **QA‑SuperAdmin** | admin@pharmacy-mcq.local | Super Admin (everything + organizations) |
| **QA‑InstAdmin** | provisioned (Admin in a seat-billed org) | Institution administrator |
| **QA‑InstMember** | provisioned (Student in that org) | Institution member |

Plus three oversight agents:
- **Test Lead** (orchestrator) — builds the oracle, provisions data, assigns work, sequences phases.
- **Verifier** (adversarial) — independently reproduces each reported failure; default-refute.
- **Reporter** — synthesizes the matrix, bug list, screenshots, and coverage report.

## 4. Page inventory (27)

**Public / auth:** `/` (root redirect), `/login`, `/register`

**Student area (nav shown to every authenticated user):**
`/dashboard`, `/practice`, `/practice/[id]`, `/mock-tests`, `/mock-tests/sessions/[id]`,
`/revision`, `/study-plan`, `/analytics`, `/plans`, `/notifications`

**Admin area (`/admin/*`, gated):**
`/admin/organizations`, `/admin/questions`, `/admin/questions/new`, `/admin/questions/[id]`,
`/admin/questions/import`, `/admin/knowledge`, `/admin/curriculum`, `/admin/exams`,
`/admin/mock-tests`, `/admin/tracks`, `/admin/plans`, `/admin/users`, `/admin/audit`,
`/admin/recommendation-rules`

## 5. Expected-access oracle (derived from `app-shell.tsx` nav gating + `rbac.ts` permission bundles)

`✅` = visible & usable · `🚫` = correctly denied (nav hidden **and** `/admin` guard shows
"Not authorized" + API 403) · `—` = page shown to all authenticated users (student nav has no gate).

| Page / Role | Student | Author | Reviewer | Acad. Head | Admin | Super |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Student nav (dashboard…notifications) | — | — | — | — | — | — |
| /admin/questions | 🚫 | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/knowledge | 🚫 | 🚫 | 🚫 | ✅ | ✅ | ✅ |
| /admin/curriculum | 🚫 | 🚫 | 🚫 | ✅ | ✅ | ✅ |
| /admin/exams | 🚫 | 🚫 | 🚫 | ✅ | ✅ | ✅ |
| /admin/mock-tests (build) | 🚫 | 🚫 | 🚫 | ✅ | ✅ | ✅ |
| /admin/tracks | 🚫 | 🚫 | 🚫 | ✅ | ✅ | ✅ |
| /admin/plans (manage) | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | ✅ |
| /admin/users | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | ✅ |
| /admin/audit | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | ✅ |
| /admin/recommendation-rules | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | ✅ |
| /admin/organizations | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ✅ |

Tenant overlays (verify the multi-tenancy work we shipped):
- **QA‑InstAdmin**: same admin matrix as Admin, but Users list is **scoped to its own org**; `/plans`
  shows the **institution's chosen plan** (org-admin view); can never see Super Admins (tier rule).
- **QA‑InstMember**: student matrix; `/plans` shows the **text-only "Institutional plan" card** (no
  pricing/buy).

This oracle is the assertion source of truth for the Phase‑1 sweep.

## 6. Real-world scenario library (cross-role journeys)

| # | Scenario | Roles crossed | Asserts |
|---|---|---|---|
| S1 | **Question lifecycle**: Author drafts → submits → Reviewer approves → Acad. Head publishes → Student practices it → answers → analytics reflect it | Author→Reviewer→AcadHead→Student | Authoring/review/publish gates; published Q reaches practice; analytics update |
| S2 | **Weight-driven blueprint → mock**: Acad. Head builds exam profile + blueprint (weights→derived counts), "Validate pool", creates BLUEPRINT mock → Student takes it → result/rank | AcadHead→Student | Blueprint derivation, plan warnings, assembly, scoring |
| S3 | **FIXED mock**: Acad. Head creates mock, attaches questions (derived count), publishes (blocked when empty) → Student takes it | AcadHead→Student | Derived count, publish guard, snapshotting |
| S4 | **Knowledge-driven track**: Acad. Head creates track+module, maps knowledge → Student practices module | AcadHead→Student | Module pool = module's knowledge nodes |
| S5 | **Institution onboarding**: Super provisions org + seat plan → InstAdmin manages members (seat cap), sees own plan → InstMember sees text-only plan, practices | Super→InstAdmin→InstMember | Seat cap, org-scoped users, plan visibility, tier rule |
| S6 | **RBAC negative sweep**: each lower role directly opens every forbidden `/admin/*` URL and POSTs to its API | all | UI "Not authorized" + API 403; no data leak |
| S7 | **Commerce (individual)**: Student with no plan → `/plans` → subscribe → checkout PENDING; Admin manages plans/prices | Student, Admin | Plans visibility, checkout, plan management |
| S8 | **Daily student loop**: practice (filters + custom count) → revision (due cards) → study-plan → analytics → notifications | Student | Core learner UX end-to-end |

## 7. Execution architecture — two layers (defense in depth)

- **Layer A — Real-user UI** (browser via **Preview MCP** driving `localhost:3000`): log in, click
  through nav, render each page, fill/submit forms, capture screenshots + console/network errors.
  This is the "real user in the real world" layer — proves what the user actually *sees and does*.
- **Layer B — Behavioral/RBAC** (Node fetch scripts against `:4000`, like the existing `scripts/*.cjs`):
  deterministic assertions of access control and data correctness for every role × endpoint, and the
  reliable backbone for multi-step journeys (fast, repeatable, no flakiness).

A finding is strongest when **both** agree (UI shows denial *and* API returns 403). Layer B is the
oracle of record; Layer A is the experience check.

## 8. Multi-agent orchestration (the workflow)

Runs as a single background **Workflow** with these phases:

- **Phase 0 — Setup (1 agent, Test Lead).** Confirm `:3000`/`:4000` up; verify/seed demo accounts;
  provision a throwaway institution + seat plan + InstAdmin + InstMember; emit the expected-access
  oracle (§5) as structured data. Aborts early with a clear message if servers are down.
- **Phase 1 — Per-role page sweep (fan-out, 8 personas in parallel).** Each persona walks its full
  page list: asserts nav visibility, page access (or "Not authorized"), the primary action(s) on each
  reachable page, and screenshots. Returns structured findings vs. the oracle.
- **Phase 2 — Cross-role journeys (pipeline, S1–S8).** Each scenario is a sequenced run; artifacts
  created by one persona are handed to the next. Independent scenarios run concurrently.
- **Phase 3 — Adversarial verification (fan-out).** Every *failed* assertion from Phases 1–2 is handed
  to a fresh Verifier instructed to **refute by default** — it re-runs the exact steps; a finding is
  "confirmed" only if it reproduces. Kills false positives.
- **Phase 4 — Synthesis (1 agent, Reporter).** Builds the matrix heat-map, the confirmed-bug list
  (severity + repro + evidence), screenshot index, and coverage gaps. Writes
  `docs/qa/RESULTS-<date>.md` and updates `TODO.md`.
- **Phase 5 — Cleanup (1 agent).** Removes throwaway artifacts (stamped questions/mocks/tracks, the
  test institution + its users). Logs anything intentionally left.

Concurrency is capped automatically; personas are independent so Phase 1 is fully parallel.

## 9. Structured outputs (schemas)

- **Finding**: `{ page, role, scenario?, layer: "UI"|"API", expected, actual, status: "pass"|"fail",
  severity: "blocker"|"high"|"medium"|"low", evidence: { screenshot?, httpStatus?, console? }, steps[] }`
- **Verdict** (Phase 3): `{ findingId, reproduced: boolean, notes }`
- **ScenarioResult**: `{ id, steps: [{ actor, action, expected, actual, status }], status }`

## 10. Reporting & artifacts

- `docs/qa/RESULTS-<date>.md`: matrix heat-map · confirmed bugs (severity-sorted) · per-scenario
  transcript · coverage gaps · screenshot index.
- Screenshots saved per (page, role).
- `TODO.md` gets a "QA sweep (done)" section with the headline numbers.

## 11. Severity rubric

- **Blocker** — security/RBAC breach (a role reaches forbidden data/action), data loss, page crash.
- **High** — primary action broken for an allowed role; cross-role journey fails.
- **Medium** — secondary action broken; wrong/misleading state; missing validation.
- **Low** — cosmetic, copy, minor UX.

## 12. Test data & safety

- Read-mostly against existing demo accounts. All mutations use stamped names (`qa-<ts>-…`).
- A throwaway institution (+plan +2 users) is provisioned for S5 and torn down in Phase 5.
- No destructive writes to seed/real data. Cleanup is explicit and logged.

## 13. Open decisions (defaults chosen — tell me to change before "continue")

1. **Browser layer:** Preview MCP driving `localhost:3000` *(default)* vs. API-only (faster, no
   screenshots) vs. Claude-in-Chrome.
2. **On bugs:** **report only** *(default)* vs. auto-fix confirmed blockers/highs in the same run.
3. **Depth:** full matrix (8 personas × 27 pages) + S1–S8 + adversarial verify *(default)* vs. a
   smaller smoke pass first.

## 14. On "continue"

Phase 0 launches as a background Workflow; you'll get the matrix + confirmed-bug report when it
completes, and can watch live via `/workflows`. Nothing mutates real data destructively; throwaway
artifacts are cleaned up in Phase 5.
