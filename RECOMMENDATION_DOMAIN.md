# RECOMMENDATION_DOMAIN.md — Phase 13

Turns mastery + activity into guidance: **weak-area detection**, a configurable **rule-driven recommendations feed**, and a **study planner**.

**Status:** implemented & verified — API build ✅, **107 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Pure engines

- **Weak areas** ([weak-areas.ts](apps/api/src/modules/recommendation/weak-areas/weak-areas.ts)) — `rankWeakAreas` keeps nodes with **both** low mastery and low accuracy (so high-accuracy-but-low-volume nodes aren't falsely flagged), ranked weakest-first by mastery gap.
- **Study planner** ([study-planner.ts](apps/api/src/modules/recommendation/planner/study-planner.ts)) — `buildStudyPlan` distributes weak areas round-robin across N days and splits the daily question budget; falls back to mixed practice.

Both pure → unit-tested.

## 2. Structure (`apps/api/src/modules/recommendation/`)

```
recommendation.module.ts
recommendation.service.ts        # weak areas, feed generation (+history), study plan
recommendation-rule.service.ts   # admin rule CRUD
weak-areas/weak-areas.ts         # pure
planner/study-planner.ts         # pure
repositories/recommendation.repository.ts
recommendation.controller.ts          # student-self
recommendation-rule.controller.ts     # Admin/Super Admin
dto/
```
Shared schemas: [`@pharmacy/contracts/recommendation`](packages/contracts/src/recommendation/recommendation.ts).

## 3. Endpoints (`/api/v1`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/recommendations/me/generate` | student-self | Generate feed (logs `recommendation_history`) |
| GET | `/recommendations/me` | student-self | Recently generated recommendations |
| GET | `/recommendations/me/weak-areas` | student-self | Weak knowledge areas |
| POST | `/recommendations/me/study-plan` | student-self | Day-by-day plan (optional exam filter) |
| POST/GET/PATCH/DELETE | `/recommendation-rules…` | **Admin / Super Admin** (`@Roles`) | Manage rules |

## 4. Feed generation

`generate` resolves the active **rules** (or built-in defaults) into enabled generators, then evaluates real signals:
- **PRACTICE_WEAK_AREA** — top weak areas from `student_mastery`.
- **REVISE_DUE** — count of due `revision_queue` items.
- **TAKE_MOCK** — if any published mock test exists.

Results are sorted by rule priority and **logged to `recommendation_history`**; `GET /recommendations/me` reads them back. Rules make the feed configurable without code changes (`definition.type`, `priority`, `limit`).

## 5. Study plan

`POST /me/study-plan` ranks weak areas (optionally intersected with an exam profile's knowledge nodes via `exam_knowledge_mapping`) and runs the pure planner → `{ days: [{ day, items[] }], totalQuestions }`.

## 6. Testing

- **Unit:** `recommendation-engines.spec` (weak-area filter/order/limit; planner distribution + mixed fallback); `recommendation.service.spec` (default feed ordering + history write, **rule-restricted generators**, history mapping, plan). (Suite: 107 green.)
- **e2e (`test/recommendation.e2e-spec.ts`, needs DB):** study plan (3 days / 27 q), weak-areas + generate arrays, **rule management admin-only** (student 403, admin create + list).

## 7. Notes

- Generators are built-in but rule-gated; adding a new recommendation type is a small switch arm + a rule. A fully data-driven rule engine (conditions DSL) can layer on later via `definition`.
- Recommendations are also a natural BullMQ pre-compute (nightly) for large user bases — the `recommendation_history` table already stores the feed.
- This closes the **intelligence loop**: Practice/Assessment → Analytics (mastery) → Recommendation (what to do next).
