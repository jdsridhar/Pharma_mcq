# KNOWLEDGE_DOMAIN.md — Phase 4

The knowledge graph: the shared backbone that **questions, curriculums, exams and learning tracks all map onto** (Golden Rule). It is a *generic directed graph*, not a fixed Subject→Chapter→Topic tree.

**Status:** implemented & verified — API build ✅, unit tests ✅ (30 total), lint 0/0 ✅. e2e provided (needs live, seeded DB).

---

## 1. Model

- **`knowledge_nodes`** — `code` (unique, immutable), `name`, `type` (free-form string: DOMAIN/CONCEPT/DRUG/… — never a hardcoded taxonomy), `description`, soft-deleted.
- **`knowledge_edges`** — `parentNodeId → childNodeId`, `relationshipType` ∈ {`IS_A`, `PART_OF`, `PREREQUISITE_OF`, `RELATED_TO`}, optional `weight`. Unique on `(parent, child, type)`; self-loops rejected.
- **Hierarchical** types (`IS_A`, `PART_OF`, `PREREQUISITE_OF`) form a **DAG**; `RELATED_TO` is associative (may form cycles).

## 2. Structure (`apps/api/src/modules/knowledge/`)

```
knowledge.module.ts
knowledge.service.ts                 # CRUD, traversal, cycle prevention, DTO mapping
repositories/knowledge.repository.ts # Prisma + recursive-CTE traversal & reachability
controllers/
  knowledge-node.controller.ts       # nodes CRUD + graph traversal
  knowledge-edge.controller.ts       # edge create/delete
dto/                                 # createZodDto wrappers over @pharmacy/contracts/knowledge
```

Shared schemas live in [`@pharmacy/contracts/knowledge`](packages/contracts/src/knowledge/knowledge.ts).

## 3. Endpoints (`/api/v1`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/knowledge/nodes` | `knowledge:manage` | Create node |
| GET | `/knowledge/nodes` | `knowledge:read` | List (filter `type`, `search`; paginated) |
| GET | `/knowledge/nodes/:id` | `knowledge:read` | Get node |
| PATCH | `/knowledge/nodes/:id` | `knowledge:manage` | Update (code immutable) |
| DELETE | `/knowledge/nodes/:id` | `knowledge:manage` | Soft-delete + drop edges |
| GET | `/knowledge/nodes/:id/descendants` | `knowledge:read` | Downward traversal |
| GET | `/knowledge/nodes/:id/ancestors` | `knowledge:read` | Upward traversal |
| GET | `/knowledge/nodes/:id/neighbors` | `knowledge:read` | Direct neighbours (depth 1) |
| POST | `/knowledge/edges` | `knowledge:manage` | Create edge (cycle-checked) |
| DELETE | `/knowledge/edges/:id` | `knowledge:manage` | Delete edge |

All routes require authentication (global `JwtAuthGuard`); authorization via `@Permissions`. `:id` params validated by `ParseUUIDPipe`.

## 4. Graph traversal

Ancestors/descendants use **recursive CTEs** over `knowledge_edges`, parameterised by:
- `?depth=` (1–20, default 5) — hop limit.
- `?relationshipTypes=IS_A,PART_OF` — CSV filter (defaults: hierarchical types for ancestors/descendants, all types for neighbours).

Results are de-duplicated, exclude soft-deleted nodes, and return `KnowledgeNodeDto[]` ordered by name.

## 5. DAG enforcement (defence in depth)

1. **App layer** — before inserting a hierarchical `parent→child` edge, the service checks `canReach(child, parent, hierarchical)` (a reachability CTE). If the child can already reach the parent, the edge would close a cycle ⇒ **409 Conflict** with a clear message.
2. **DB layer** — the Phase-2 trigger `trg_knowledge_edge_acyclic` is the backstop, so cycles are impossible even via direct SQL.

Self-loops are blocked at three layers: Zod `refine`, a CHECK constraint, and the unique key.

## 6. Lifecycle

Deleting a node is a **soft delete** (`deletedAt`) that also **hard-deletes its edges** in one transaction, so the graph never carries dangling references. All reads filter `deletedAt IS NULL`.

## 7. Testing

- **Unit (`knowledge.service.spec.ts`, no DB):** create + DTO mapping, unique→409, not-found→404, **cycle→409** (and that `canReach` is called with `child,parent`), associative edge skips the cycle check, parent-missing→404, descendant mapping.
- **e2e (`test/knowledge.e2e-spec.ts`, needs live+seeded DB):** student (read-only) create→403, admin creates nodes, duplicate code→409, hierarchical edge, **reverse edge→409 cycle**, ancestors/descendants membership, search filter. Uses the dev Super Admin for `knowledge:manage`.

## 8. Notes

- `type` is deliberately a free string so the platform stays multi-curriculum / multi-exam without code changes.
- Trigram + FTS over question text (Phase 2 operational SQL) complement this graph for content discovery; node search here is a simple case-insensitive `name`/`code` match.
- Bulk import of a knowledge graph (CSV/JSON) is an admin concern deferred to Phase 16.
