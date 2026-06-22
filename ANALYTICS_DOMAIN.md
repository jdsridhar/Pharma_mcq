# ANALYTICS_DOMAIN.md — Phase 12

Turns raw activity into insight: a **mastery engine** (per-knowledge `student_mastery`), **topic/question metrics**, and **student dashboards** — built on the event/answer data produced by Practice and Assessment.

**Status:** implemented & verified — API build ✅, **99 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Model & data sources

- **`student_mastery`** — per `(userId, knowledgeNode)`: accuracy, speedMsAvg, retention, masteryScore.
- **`question_metrics`** — per question (maintained by the Practice BullMQ worker, Phase 9).
- **`topic_metrics`** — per knowledge node (aggregated here from question metrics).
- **`events`** — the append-only activity stream (partitioned, Phase 2).

Mastery is derived from a user's **scored answers** across both `practice_answers` and `test_answers` (via the snapshot's `questionId`), grouped by knowledge node through `question_knowledge_mapping`.

## 2. The mastery engine (pure)

[`mastery/mastery.ts`](apps/api/src/modules/analytics/mastery/mastery.ts):

```
confidence  = attempts / (attempts + 5)     // saturating volume factor
masteryScore = accuracy * confidence         // in [0,1]
```

So high accuracy over very few attempts yields a modest mastery score (low confidence), while sustained, high-volume accuracy crosses the **0.8 mastery threshold**. Pure → unit-tested.

## 3. Structure (`apps/api/src/modules/analytics/`)

```
analytics.module.ts
mastery.service.ts            # recompute + my-mastery + overview
analytics.service.ts         # topic + question metrics
mastery/
  mastery.ts                 # pure computeMastery
  mastery.producer.ts        # enqueue recompute (mastery queue)
  mastery.processor.ts       # worker → MasteryService.recompute
repositories/analytics.repository.ts
analytics.controller.ts
```
Reuses the BullMQ infra; a dedicated **`mastery` queue** ([queue.module.ts](apps/api/src/infra/queue/queue.module.ts)) keeps recompute jobs off the analytics-event queue. Shared DTOs: [`@pharmacy/contracts/analytics`](packages/contracts/src/analytics/analytics.ts).

## 4. Endpoints (`/api/v1/analytics`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/me/recompute-mastery` | student-self | Recompute mastery now (returns node count) |
| GET | `/me/mastery` | student-self | Mastery by knowledge node |
| GET | `/me/overview` | student-self | Totals, accuracy, tracked/mastered nodes |
| GET | `/topics/:nodeId` | `analytics:read` | Aggregated topic metrics |
| GET | `/questions/:id` | `analytics:read` | Per-question metrics |

`me/*` act on `@CurrentUser('id')`; topic/question metrics are gated by `analytics:read` (academic head/admin).

## 5. Recompute: sync + async

`POST /me/recompute-mastery` runs **synchronously** so the response reflects fresh mastery (good UX). The **`MasteryProducer`** (exported) enqueues the same work on the `mastery` queue for event-driven recompute (e.g., a future hook after each session), de-duplicated per user via a stable `jobId`. The `MasteryProcessor` runs it off the request path.

## 6. Testing

- **Unit:** `mastery.spec` (confidence weighting, low-volume discount, mastered case); `mastery.service.spec` (empty → 0 nodes, **per-node aggregation across practice+test**, overview from counts). (Suite: 99 green.)
- **e2e (`test/analytics.e2e-spec.ts`, needs DB + Redis):** student practices a mapped question → recompute → mastery + overview reflect it; topic metrics **gated** (student 403, admin 200).

## 7. Notes

- `retention` is an accuracy proxy today; a spaced-repetition decay model (using `revision_history`) is a natural Phase-13 enhancement.
- Topic metrics are computed live from `question_metrics` (and persisted) on read; for heavy dashboards these can move to a scheduled rollup.
- The mastery output directly feeds the Recommendation domain (Phase 13): low-mastery nodes ⇒ weak areas ⇒ study plan.
