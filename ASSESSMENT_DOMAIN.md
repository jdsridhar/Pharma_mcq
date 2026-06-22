# ASSESSMENT_DOMAIN.md — Phase 10

Timed mock tests — the high-stakes counterpart to Practice. A **MockTest** is a *shared* definition (the ranking cohort); each attempt is a per-user **TestSession** that **freezes immutable snapshots** of every served question, so scoring and ranking never depend on the live (editable) questions (§7-B).

**Status:** implemented & verified — API build ✅, **83 unit tests** ✅, lint 0/0 ✅, web typecheck ✅. e2e provided (needs live DB + Redis).

---

## 1. Model

- **`mock_tests`** (shared) — `code`, `title`, `mode` (FIXED|BLUEPRINT), `durationMinutes`, `totalQuestions`, `status`, open/close window, optional `examProfileId`/`blueprintId`.
- **`mock_test_questions`** (FIXED) — `questionId`, `marks`, `negativeMarks`, order.
- **`test_sessions`** (attempt) — `mockTestId` **nullable** (= ad-hoc, no cohort), `expiresAt`, status.
- **`test_question_snapshots`** — immutable JSONB freeze (stem/options **incl. isCorrect**/answerSpec/media) + per-question marks.
- **`test_answers`** — one per snapshot (unique), scored at submit.
- **`results`** — score/maxScore/accuracy/correct/wrong/skipped/timeTaken (+ rank/percentile computed live).

## 2. Structure (`apps/api/src/modules/assessment/`)

```
assessment.module.ts
mock-test.service.ts          # mock test CRUD + FIXED question set
test-session.service.ts       # start (FIXED/BLUEPRINT/ad-hoc), serve, answer, submit, result
scoring/score-attempt.ts      # pure: scoreAttempt() + computeRank()
repositories/{mock-test,test-session}.repository.ts
controllers/{mock-test,test-session}.controller.ts
dto/
```
Reuses [`common/evaluation/answer-evaluator.ts`](apps/api/src/common/evaluation/answer-evaluator.ts). Shared schemas: [`@pharmacy/contracts/assessment`](packages/contracts/src/assessment/assessment.ts).

## 3. Endpoints (`/api/v1`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/mock-tests` | `mocktest:manage` | Create |
| GET | `/mock-tests` · `/:id` | `mocktest:read` | List / detail |
| PATCH | `/mock-tests/:id` | `mocktest:manage` | Update (publish via status) |
| PUT | `/mock-tests/:id/questions` | `mocktest:manage` | Set FIXED questions (validated PUBLISHED) |
| POST | `/mock-tests/:id/start` | **authenticated** | Start an attempt (freezes snapshots) |
| POST | `/assessments/sessions/ad-hoc` | **authenticated** | Start an ad-hoc timed test |
| GET | `/assessments/sessions` · `/:id` | **student-self** | List / attempt detail |
| POST | `/assessments/sessions/:id/answers` | **student-self** | Save an answer (unscored) |
| POST | `/assessments/sessions/:id/submit` | **student-self** | Score + result |
| GET | `/assessments/sessions/:id/result` | **student-self** | Result + rank/percentile |

## 4. Immutable snapshots

At start, each selected question's **current published version** is frozen into a `test_question_snapshots` row (full content incl. `isCorrect` + `answerSpec`). Serving strips correctness/answerSpec/explanation (MATCHING gets a shuffled prompt). **Scoring reads only snapshots** — editing or re-versioning a question never changes a past attempt, and regrades are deterministic.

## 5. Scoring & ranking ([score-attempt.ts](apps/api/src/modules/assessment/scoring/score-attempt.ts))

- `scoreAttempt` (pure): per snapshot, correct → `+marks`, wrong → `−negativeMarks`, unanswered → skipped (0). Returns score/maxScore/correct/wrong/skipped/accuracy + per-item marks (persisted to answers for review).
- Submit sets status `COMPLETED` (or `EXPIRED` if past `expiresAt`), records `timeTaken`, and upserts the `Result` (idempotent — re-submit returns the existing result).
- `computeRank` (pure): for a `mockTestId` cohort, `rank = #higher + 1`, `percentile = % at-or-below`. Computed **live on read** from cohort results, so ranks are always fresh without rewriting rows. Ad-hoc sessions (no mock test) have no rank.

## 6. Modes

- **FIXED** — fixed question set with per-question marks.
- **BLUEPRINT** — questions generated per attempt from the pool by the linked exam blueprint's items (weight→count, optional knowledge node).
- **Ad-hoc** — student-chosen filters + duration; no cohort ranking.

## 7. Testing

- **Unit:** `score-attempt.spec` — marks/negative/skip math, empty-answer = skip, **ranking + percentile** (incl. empty cohort); `test-session.service.spec` — ownership→403, ad-hoc no-pool→400, **idempotent submit**. (Suite: 83 green.)
- **e2e (`test/assessment.e2e-spec.ts`, needs DB + Redis):** admin publishes a question + FIXED mock test, student starts (snapshot options carry **no `isCorrect`**), saves an answer, submits → `maxScore=4`, `rank=1`, cohort ≥ 1.

## 8. Notes

- Snapshots make the platform safe for content edits mid-exam-season and enable trustworthy regrades.
- Auto-expiry is enforced at submit (status → EXPIRED if past `expiresAt`); a scheduled sweep to auto-submit abandoned-but-expired sessions can be added via BullMQ (Phase 12/20 ops).
- Cohort ranking is computed live; for very large cohorts this can be precomputed/cached (a future optimization) — the `Result.rank/percentile` columns are reserved for that.
