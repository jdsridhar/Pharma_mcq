# LEARNING_DOMAIN.md — Phase 8

A **LearningTrack** is a guided study path: an ordered set of **modules** that map onto the knowledge graph, optionally tied to an exam, with **per-student progress**. Questions attach to modules via a mapping table (Golden Rule).

**Status:** implemented & verified — API build ✅, **64 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live, seeded DB).

---

## 1. Model

- **`learning_tracks`** — `code` (unique), `name`, `description`, optional `examProfileId`, `status`, soft-delete.
- **`track_modules`** — per track: `name`, `description?`, `displayOrder` (ordered).
- **`track_knowledge_mapping`** — module ↔ knowledge node.
- **`track_progress`** — per `(userId, trackModuleId)` (unique): `status` (NOT_STARTED/IN_PROGRESS/COMPLETED), `completedAt`.
- **`question_track_mapping`** — question ↔ module (the final deferred Phase-5 mapping, implemented here).

## 2. Structure (`apps/api/src/modules/learning/`)

```
learning.module.ts
learning.service.ts          # track CRUD + progress read (merged)
track-module.service.ts      # module CRUD, knowledge mapping, progress upsert
repositories/learning.repository.ts
controllers/
  learning-track.controller.ts
  track-module.controller.ts
dto/                         # createZodDto wrappers
```

Shared schemas: [`@pharmacy/contracts/learning`](packages/contracts/src/learning/learning.ts).

## 3. Endpoints (`/api/v1`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/tracks` | `track:manage` | Create track (validates `examProfileId`) |
| GET | `/tracks` | `track:read` | List (status/exam/search, paginated) |
| GET | `/tracks/:id` | `track:read` | Get track + modules |
| PATCH | `/tracks/:id` | `track:manage` | Update (re-link/clear exam) |
| DELETE | `/tracks/:id` | `track:manage` | Soft-delete |
| GET | `/tracks/:id/progress` | **authenticated** | Current user's progress across modules |
| POST | `/tracks/:id/modules` | `track:manage` | Create module |
| PATCH | `/tracks/:id/modules/:moduleId` | `track:manage` | Update module |
| DELETE | `/tracks/:id/modules/:moduleId` | `track:manage` | Delete module |
| PUT | `…/:moduleId/knowledge` | `track:manage` | Replace module→knowledge mappings |
| PUT | `…/:moduleId/progress` | **authenticated** | Set current user's module progress |
| PUT | `/questions/:id/mappings/tracks` | `question:update` | Replace question→track mappings |

## 4. Progress (student-self)

Progress endpoints are gated by authentication only (any student) and act on **the caller** via `@CurrentUser('id')` — a student can never read or write another's progress. `setProgress` upserts on `(userId, trackModuleId)` and stamps `completedAt` when status becomes `COMPLETED`. `GET …/progress` **merges** the track's modules with the user's records, defaulting untouched modules to `NOT_STARTED` — so the client always gets one row per module in display order.

## 5. Mappings

- **Module ↔ knowledge** and **question ↔ track-module** use **PUT replace-set** with id-existence validation. `QuestionDetailDto` now surfaces `trackModuleIds`, completing the mapping surface: **knowledge + curriculum + exam + track + tags**.

## 6. Testing

- **Unit:** `learning.service.spec` — invalid exam → 400, duplicate code → 409, **progress merge** (untouched → NOT_STARTED); `track-module.service.spec` — module-not-in-track → 404, unknown knowledge → 400, **`completedAt` set on COMPLETED / null otherwise**. (Suite: 64 green.)
- **e2e (`test/learning.e2e-spec.ts`, needs DB):** invalid-exam track → 400, track + module, module→knowledge, **progress set + read**, question→track mapping in question detail.

## 7. Notes

- Tracks/modules are free-form and exam-optional, so any guided path (crash course, weak-area remediation, full syllabus) is data, not code.
- Per-module progress feeds the Analytics (Phase 12) and Recommendation (Phase 13) domains; the Practice/Assessment domains (Phases 9–10) consume question↔track/exam/knowledge mappings to build sessions.
- This phase closes the **content domains** (Knowledge → Question → Curriculum → Exam → Learning). Phases 9+ are **student-activity** domains.
