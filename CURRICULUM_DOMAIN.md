# CURRICULUM_DOMAIN.md — Phase 6

A **curriculum** is an ordered **tree** of nodes (e.g. Semester → Subject → Topic) whose nodes map onto the shared knowledge graph. Questions attach to curriculum nodes via a mapping table — never a direct FK (Golden Rule).

**Status:** implemented & verified — API build ✅, **48 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live, seeded DB).

---

## 1. Model

- **`curriculums`** — `code` (unique), `name`, `description`, `status` (ContentStatus), soft-delete.
- **`curriculum_nodes`** — self-referential tree (`parentId`); `name`, `code?`, `displayOrder`. Cascade-deleted with the curriculum.
- **`curriculum_knowledge_mapping`** — node ↔ knowledge node (many-to-many).
- **`question_curriculum_mapping`** — question ↔ curriculum node (the deferred Phase-5 mapping, implemented here).

## 2. Structure (`apps/api/src/modules/curriculum/`)

```
curriculum.module.ts
curriculum.service.ts          # curriculum CRUD
curriculum-node.service.ts     # tree CRUD, validation, knowledge mapping, tree build
repositories/curriculum.repository.ts
controllers/
  curriculum.controller.ts     # curriculum CRUD + tree
  curriculum-node.controller.ts
dto/                           # createZodDto wrappers
```

Shared schemas: [`@pharmacy/contracts/curriculum`](packages/contracts/src/curriculum/curriculum.ts). The question↔curriculum mapping reuses the Question module's `QuestionMappingService`/controller.

## 3. Endpoints (`/api/v1`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/curriculums` | `curriculum:manage` | Create curriculum |
| GET | `/curriculums` | `curriculum:read` | List (status/search, paginated) |
| GET | `/curriculums/:id` | `curriculum:read` | Get curriculum |
| GET | `/curriculums/:id/tree` | `curriculum:read` | Nested node tree |
| PATCH | `/curriculums/:id` | `curriculum:manage` | Update |
| DELETE | `/curriculums/:id` | `curriculum:manage` | Soft-delete |
| POST | `/curriculums/:id/nodes` | `curriculum:manage` | Create node |
| PATCH | `/curriculums/:id/nodes/:nodeId` | `curriculum:manage` | Rename / reorder / re-parent |
| DELETE | `/curriculums/:id/nodes/:nodeId` | `curriculum:manage` | Delete a leaf node |
| PUT | `/curriculums/:id/nodes/:nodeId/knowledge` | `curriculum:manage` | Replace node→knowledge mappings |
| PUT | `/questions/:id/mappings/curriculum` | `question:update` | Replace question→curriculum mappings |

## 4. Tree integrity

- A node's `parentId` must reference a node **in the same curriculum** (else 400).
- **Re-parenting** rejects making a node its own parent and rejects moving a node under one of its own descendants (in-memory reachability over the curriculum's nodes) → **409**.
- **Delete** is leaf-only: deleting a node with children → **409** ("move/delete children first"); deleting a leaf cascades its mappings.
- The tree endpoint builds a nested structure from flat rows, ordered by `displayOrder`.

## 5. Mappings

- **Node ↔ knowledge** and **question ↔ curriculum** both use **PUT replace-set** semantics with existence validation of the referenced ids (unknown id → 400). `QuestionDetailDto` now surfaces `curriculumNodeIds`.

## 6. Testing

- **Unit:** `curriculum-node.service.spec` — cross-curriculum parent→400, self-parent→409, **cycle re-parent→409**, delete-with-children→409, nested tree build, unknown-knowledge→400; `curriculum.service.spec` — create+map, duplicate→409, missing→404. (Suite: 48 green.)
- **e2e (`test/curriculum.e2e-spec.ts`, needs DB):** curriculum + tree create, nested tree, node→knowledge mapping, **question→curriculum mapping reflected in question detail**, delete-with-children 409 then leaf delete 204.

## 7. Notes

- `code`/`name` are free-form — the platform stays multi-curriculum (D.Pharm/B.Pharm/GPAT/…) without code changes.
- Curriculum nodes are a *navigational* tree; semantic relationships live in the knowledge graph, which nodes map onto. This keeps content reusable across curriculums.
- Exam and learning-track mappings for questions follow in Phases 7–8 using the same `QuestionMappingService` pattern.
