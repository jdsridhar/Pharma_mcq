# EXAM_DOMAIN.md — Phase 7

An **ExamProfile** (GPAT, NIPER, MRB, Drug Inspector, …) owns **Blueprints**; a blueprint is a set of **weighted items** (subject/area → weightage, count, difficulty mix) used to assemble mock tests. Questions attach to exam profiles via a mapping table (Golden Rule).

**Status:** implemented & verified — API build ✅, **57 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live, seeded DB).

---

## 1. Model

- **`exam_profiles`** — `code` (unique), `name`, `description`, `status`, soft-delete.
- **`exam_blueprints`** — per profile: `name`, `totalQuestions`, `durationMinutes?`, `isActive`.
- **`exam_blueprint_items`** — `label`, `weightPercent` (0–100, CHECK), `questionCount`, `difficultyMix` JSON `{EASY,MEDIUM,HARD}`, optional `knowledgeNodeId`.
- **`exam_knowledge_mapping`** — exam profile ↔ knowledge node (with `importance`).
- **`question_exam_mapping`** — question ↔ exam profile (with `relevance`) — the deferred Phase-5 mapping, implemented here.

## 2. Structure (`apps/api/src/modules/exam/`)

```
exam.module.ts
exam.service.ts             # profile CRUD + knowledge mapping
exam-blueprint.service.ts   # blueprints + items + weight-budget guard
repositories/exam.repository.ts
controllers/
  exam-profile.controller.ts
  exam-blueprint.controller.ts
dto/                        # createZodDto wrappers
```

Shared schemas: [`@pharmacy/contracts/exam`](packages/contracts/src/exam/exam.ts). Question↔exam mapping reuses the Question module's `QuestionMappingService`.

## 3. Endpoints (`/api/v1`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/exams` | `exam:manage` | Create profile |
| GET | `/exams` | `exam:read` | List (status/search, paginated) |
| GET | `/exams/:id` | `exam:read` | Get profile |
| PATCH | `/exams/:id` | `exam:manage` | Update |
| DELETE | `/exams/:id` | `exam:manage` | Soft-delete |
| PUT | `/exams/:id/knowledge` | `exam:manage` | Replace exam→knowledge mappings |
| GET | `/exams/:id/blueprints` | `exam:read` | List blueprints (with items) |
| POST | `/exams/:id/blueprints` | `exam:manage` | Create blueprint |
| GET | `/exams/:id/blueprints/:bpId` | `exam:read` | Get blueprint + items |
| PATCH | `/exams/:id/blueprints/:bpId` | `exam:manage` | Update blueprint |
| DELETE | `/exams/:id/blueprints/:bpId` | `exam:manage` | Delete blueprint (+items) |
| POST | `/exams/:id/blueprints/:bpId/items` | `exam:manage` | Add weighted item |
| PATCH | `…/items/:itemId` | `exam:manage` | Update item |
| DELETE | `…/items/:itemId` | `exam:manage` | Delete item |
| PUT | `/questions/:id/mappings/exams` | `question:update` | Replace question→exam mappings |

## 4. Blueprint weighting

- Each item's `weightPercent` is 0–100 (Zod + DB CHECK).
- **Budget guard**: adding/updating an item rejects (**400**) when the sum of `weightPercent` across the blueprint's items would exceed 100% (the edited item is excluded from the sum on update). A small epsilon tolerates floating-point noise.
- `difficultyMix` (`{EASY,MEDIUM,HARD}`) and an optional `knowledgeNodeId` let the (Phase-10) assembly engine pick the right number of questions at the right difficulty from the right knowledge area.

## 5. Mappings

- **Exam ↔ knowledge** (`importance`) and **question ↔ exam** (`relevance`) use **PUT replace-set** with id-existence validation (unknown id → 400). `QuestionDetailDto` now surfaces `examProfileIds` (alongside `knowledgeNodeIds`, `curriculumNodeIds`, `tags`).

## 6. Testing

- **Unit:** `exam-blueprint.service.spec` — **weight-budget guard** (>100 → 400, within budget OK, update excludes self), unknown-knowledge → 400, blueprint-not-in-exam → 404; `exam.service.spec` — create/map, duplicate → 409, missing → 404, unknown knowledge → 400. (Suite: 57 green.)
- **e2e (`test/exam.e2e-spec.ts`, needs DB):** profile + knowledge mapping, blueprint, items with **budget enforcement (60 → +50 rejected → +40 accepted)**, blueprint detail, **question→exam mapping in question detail**.

## 7. Notes

- Exam codes/names are free-form, so adding any future exam is data, not code (multi-exam-ready).
- Blueprints describe *intent* (weightage/counts/difficulty); the Assessment domain (Phase 10) consumes them with the question pool (filtered via `question_exam_mapping` + difficulty) to generate mock tests.
- This completes the question mapping surface for the content domains: knowledge, curriculum, exam, and tags (learning-track mapping follows in Phase 8).
