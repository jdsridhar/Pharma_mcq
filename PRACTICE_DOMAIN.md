# PRACTICE_DOMAIN.md — Phase 9

Untimed self-study. A student starts a session from a filtered pool of **published** questions, answers with **immediate feedback**, and gets a summary. This is the first student-activity domain and introduces the **reusable answer-evaluation engine** and **BullMQ** for async analytics.

**Status:** implemented & verified — API build ✅, **76 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. The answer-evaluation engine (reusable)

[`common/evaluation/answer-evaluator.ts`](apps/api/src/common/evaluation/answer-evaluator.ts) is a **pure** strategy-per-type scorer (no DB, no DI) — reused by Assessment (Phase 10) over immutable snapshots:

| Type | Rule |
|---|---|
| SINGLE_CHOICE / ASSERTION_REASON | exactly the one correct option |
| MULTI_CHOICE | exact correct set |
| TRUE_FALSE | boolean equals `answerSpec.answer` |
| NUMERIC | `|answer − value| ≤ tolerance` |
| MATCHING | every left→right pair matches (order-independent) |

Returns `{ isCorrect, correctOptionIds }`. Fully unit-tested per type.

## 2. Structure (`apps/api/src/modules/practice/`)

```
practice.module.ts
practice.service.ts             # sessions, pool selection, scoring, summary
practice.controller.ts          # student-self routes
repositories/practice.repository.ts
analytics/
  practice-analytics.producer.ts   # enqueue (best-effort)
  practice-analytics.processor.ts  # BullMQ worker
  practice-analytics.repository.ts # question metrics + event store
dto/
```
BullMQ root + the `analytics` queue live in [`infra/queue/queue.module.ts`](apps/api/src/infra/queue/queue.module.ts). Shared schemas: [`@pharmacy/contracts/practice`](packages/contracts/src/practice/practice.ts).

## 3. Endpoints (`/api/v1/practice/sessions`) — all student-self

| Method | Path | Purpose |
|---|---|---|
| POST | `/` | Start a session from a filtered pool |
| GET | `/` | List own sessions (paginated) |
| GET | `/:id` | Session with served questions |
| GET | `/:id/summary` | Accuracy + per-knowledge breakdown |
| POST | `/:id/answers` | Submit an answer → immediate feedback |
| POST | `/:id/complete` | Complete → summary |
| POST | `/:id/abandon` | Abandon |

No RBAC permission — any authenticated user; the service verifies `session.userId === caller` (others → 403).

## 4. Pool selection

`start` filters **PUBLISHED** questions (with a current version) by `knowledgeNodeIds` / `examProfileId` / `trackModuleId` / `tagIds` / `difficulty` via the mapping tables, caps the candidate set, shuffles, and takes `count`. Each served question pins `servedVersionId` (the published version shown). No matches → 400.

## 5. No answer leakage

Served questions **omit `isCorrect`**, `answerSpec` and `explanation`. For MATCHING, the client gets a `matchingPrompt` (`lefts` + a **shuffled** `rights`) — never the pairing. Feedback (`isCorrect`, `correctOptionIds`, `explanation`) is returned **only** in the answer response, after submission.

## 6. Analytics (BullMQ)

On each answer the service enqueues a `practice.answer-recorded` job (**best-effort** — a queue outage never fails the answer). The worker updates `question_metrics` (attempts, correct rate, running avg time) and appends to the partitioned `events` store — moving aggregation off the request path (eventually-consistent, matching the event-driven architecture). The dedicated BullMQ Redis connection is configured from `REDIS_URL` with `maxRetriesPerRequest: null`.

## 7. Testing

- **Unit:** `answer-evaluator.spec` (all 6 types incl. edge cases); `practice.service.spec` (no-pool→400, ownership→403, not-in-progress→409, **correct scoring + persist + enqueue**, summary breakdown); `practice-analytics.repository.spec` (first-answer init, running average/rate). (Suite: 76 green.)
- **e2e (`test/practice.e2e-spec.ts`, needs DB + Redis):** admin publishes a question; student starts a session (served options have **no `isCorrect`**), other user → 403, answer feedback, complete → summary.

## 8. Notes

- Practice reads the *served version* (not a frozen snapshot) — it's low-stakes; immutable snapshots are introduced for **timed** assessments in Phase 10, which reuse this same evaluator.
- Cross-session "exclude recently seen" and adaptive difficulty are future enhancements (Recommendation, Phase 13).
- `question_metrics` populated here feed difficulty calibration (Phase 12) and weak-area detection (Phase 13).
