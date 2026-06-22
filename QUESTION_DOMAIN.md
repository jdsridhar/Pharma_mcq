# QUESTION_DOMAIN.md — Phase 5

The platform's content core. A **Question** is a stable identity; its editable content lives in immutable **versions**; correctness is a typed **answerSpec**; and every classification is a **mapping** (Golden Rule — no exam/curriculum FK on the question).

**Status:** implemented & verified — API build ✅, **39 unit tests** ✅, lint 0/0 ✅. e2e provided (needs live, seeded DB).

---

## 1. Model & lifecycle

- **`questions`** — `questionCode` (unique, immutable), `questionType` (immutable), workflow `status`, `authorDifficulty`, `calculatedDifficulty` (Phase 12), `language`, `currentVersionId` (the live version), denormalized `normalizedTextHash`, `createdById`, soft-delete.
- **`question_versions`** — `versionNumber`, `questionText`, `explanation`, `answerSpec` (JSONB), `normalizedTextHash`, `status`; holds **options** + **media**.
- Editing creates a **new version** (DRAFT); the published `currentVersion` keeps serving until the new one is published. History is preserved for snapshots/regrades.

## 2. Typed answer spec (`answerSpec`)

A Zod **discriminated union** on type, validated at the boundary and stored as JSONB:

| Type | answerSpec | Options |
|---|---|---|
| SINGLE_CHOICE / ASSERTION_REASON | `{ type }` | ≥2 options, **exactly 1** correct |
| MULTI_CHOICE | `{ type }` | ≥2 options, **≥1** correct |
| TRUE_FALSE | `{ type, answer: boolean }` | none |
| NUMERIC | `{ type, value, tolerance≥0 }` | none |
| MATCHING | `{ type, pairs: [{left,right}] }` (≥2) | none |

Cross-field rules (Zod `superRefine`): `answerSpec.type` must equal `questionType`, and the option list must match the type. This drives the scoring strategy engine in Phase 10.

## 3. Structure (`apps/api/src/modules/question/`)

```
question.module.ts
question.service.ts            # lifecycle, versioning, review workflow, dedup, search
question-mapping.service.ts    # knowledge + tag mappings (Golden Rule surface)
repositories/question.repository.ts  # Prisma (transactional version create) + trigram dedup
controllers/
  question.controller.ts       # CRUD, versions, workflow, duplicate check
  question-mapping.controller.ts
dto/                           # createZodDto wrappers
utils/normalized-hash.util.ts  # shared normalize + SHA-256
```

Shared schemas/DTOs: [`@pharmacy/contracts/question`](packages/contracts/src/question/question.ts) (incl. `normalizeQuestionText`).

## 4. Endpoints (`/api/v1`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/questions` | `question:create` | Create question + v1 (DRAFT) |
| GET | `/questions` | `question:read` | List (status/type/knowledge/text, paginated) |
| GET | `/questions/check-duplicate` | `question:read` | Trigram near-duplicate candidates |
| GET | `/questions/:id` | `question:read` | Detail (current + working version, mappings) |
| GET | `/questions/:id/versions` | `question:read` | Version history |
| POST | `/questions/:id/versions` | `question:update` | New content version (→ DRAFT) |
| PATCH | `/questions/:id` | `question:update` | Metadata (difficulty/language) |
| POST | `/questions/:id/submit` | `question:update` | DRAFT → REVIEW |
| POST | `/questions/:id/approve` | `question:approve` | REVIEW → APPROVED |
| POST | `/questions/:id/reject` | `question:review` | REVIEW → DRAFT |
| POST | `/questions/:id/publish` | `question:publish` | APPROVED → PUBLISHED (promotes working version) |
| POST | `/questions/:id/archive` | `question:publish` | → ARCHIVED |
| DELETE | `/questions/:id` | `question:delete` | Soft-delete |
| PUT | `/questions/:id/mappings/knowledge` | `question:update` | Replace knowledge mappings |
| PUT | `/questions/:id/mappings/tags` | `question:update` | Replace tags (created on demand) |

## 5. Review workflow

`DRAFT → REVIEW → APPROVED → PUBLISHED → ARCHIVED` (reject sends REVIEW→DRAFT). Each transition is permission-gated and **state-checked** (invalid transitions → 409). Authoring actions (new version, metadata, submit) additionally enforce **ownership** via `PolicyService.assertOwnerOrPermission(user, createdById, question:review)` — an author edits only their own drafts; reviewers/admins may act on any.

## 6. Deduplication (Golden Rule)

- **Exact**: `normalizedTextHash = sha256(normalizeQuestionText(text))` (lowercase, NFKC, strip punctuation, collapse whitespace — shared client/server). On create/new-version, an identical hash on another live question → **409**.
- **Near-duplicate (advisory)**: `GET /questions/check-duplicate` runs `pg_trgm` `similarity()` over question text (uses the operational trigram index) and returns ranked candidates above a threshold — surfaced to authors before they submit.

## 7. Mapping system

`PUT` replace-semantics for **knowledge** (`{items:[{knowledgeNodeId, weight?}]}`, validated against existing nodes) and **tags** (`{tags:[...]}`, get-or-create by slug). Exam/curriculum/track mappings are added in Phases 6/7/8 alongside their target entities. All mapping tables already exist (Phase 2).

## 8. Testing

- **Unit (no DB):** `question.service.spec` — exact-dup→409 (no write), create→detail, addVersion ownership→403, type-immutability→409, invalid transition→409, **publish promotes working version** (asserts `currentVersion.connect` + hash); `normalized-hash.util.spec` — normalization + hash equality/inequality. (Total suite: 39 green.)
- **e2e (`test/question.e2e-spec.ts`, needs DB):** consistency 400, create DRAFT, duplicate 409, knowledge mapping, **submit→approve→publish**, approve-after-publish 409, list by status.

## 9. Notes

- Choice correctness lives on `options.isCorrect`; the immutable test snapshot (Phase 10) captures it so scoring never reads the live question.
- Text search uses `currentVersion` `ILIKE` now; the Phase-2 FTS `search_vector` (operational SQL) can back a richer search behind the same endpoint later.
- `answerSpec` is stored verbatim as JSONB, ready for the strategy-based evaluation engine (Phase 10).
