# REVISION_DOMAIN.md — Phase 11

A per-student **spaced-repetition** queue. Items (sourced from wrong answers, bookmarks, weak topics, time gaps) become due over growing intervals; each review records an outcome and reschedules the next due date.

**Status:** implemented & verified — API build ✅, **93 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Model

- **`revision_queue`** — one row per `(userId, questionId)` (unique): `source`, `priority`, `status` (PENDING/DONE/SNOOZED), `dueAt`, `lastReviewedAt`, `reviewCount`.
- **`revision_history`** — one row per review with the `outcome` (CORRECT/WRONG/SKIPPED) — the audit trail / analytics feed.

## 2. The scheduler (pure)

[`scheduler/revision-scheduler.ts`](apps/api/src/modules/revision/scheduler/revision-scheduler.ts) — a Leitner-style growing interval, **no DB/clock dependency** (caller passes `now`):

| Outcome | Effect |
|---|---|
| CORRECT | advance to next interval `[1, 3, 7, 16, 35]` days; **5 successful reviews ⇒ mastered (DONE)** |
| WRONG | reset progress → due in 1 day |
| SKIPPED | keep progress → due in 1 day |

Fully unit-tested (interval growth, mastery retirement, reset, skip).

## 3. Structure (`apps/api/src/modules/revision/`)

```
revision.module.ts
revision.service.ts
revision.controller.ts        # student-self routes
scheduler/revision-scheduler.ts
repositories/revision.repository.ts
dto/
```
Shared schemas: [`@pharmacy/contracts/revision`](packages/contracts/src/revision/revision.ts).

## 4. Endpoints (`/api/v1/revision`) — all student-self

| Method | Path | Purpose |
|---|---|---|
| POST | `/items` | Add a question (validates PUBLISHED; idempotent per question) |
| GET | `/queue` | List the queue (status filter, paginated) |
| GET | `/due` | Items due now (`PENDING`/`SNOOZED` with `dueAt ≤ now`) |
| POST | `/items/:id/review` | Record outcome → history + reschedule |
| POST | `/items/:id/snooze` | Postpone N days |
| POST | `/generate-from-wrong` | Populate from the user's recent wrong answers |

`@CurrentUser('id')` everywhere; the service verifies item ownership (others → 403).

## 5. Sources & generation

`generate-from-wrong` scans the user's recent **wrong** practice + test answers (test answers via their snapshot's `questionId`), keeps only **published** questions **not already queued**, and bulk-inserts `WRONG_ANSWER` items. Priority is seeded by source (wrong > weak-topic > bookmark/time-gap), driving the due-list order. Bookmark/weak-topic/time-gap items can be added via `POST /items`.

## 6. Testing

- **Unit:** `revision-scheduler.spec` (interval growth, mastery, reset, skip); `revision.service.spec` (unpublished→400, idempotent add, **review appends history + reschedules**, ownership→403, generate dedupes published/queued). (Suite: 93 green.)
- **e2e (`test/revision.e2e-spec.ts`, needs DB):** add → unknown-question 400 → correct review advances `reviewCount` → queue listing.

## 7. Notes

- The scheduler is deliberately simple and deterministic; an SM-2 ease-factor variant can replace it without touching the service (same `scheduleNextReview` shape).
- `revision_history` feeds the Analytics domain (Phase 12); auto-enqueueing wrong answers into the queue (event-driven, via the BullMQ analytics worker) is a natural Phase-12 enhancement — for now generation is on-demand.
- `(userId, dueAt)` is indexed (Phase 2) for the hot "due now" query.
