import type { RevisionOutcomeT } from '@pharmacy/contracts';

/**
 * Spaced-repetition scheduler (pure). A Leitner-style growing interval:
 *  - CORRECT advances to the next, longer interval; mastering all of them retires the item.
 *  - WRONG resets to the start (short interval).
 *  - SKIPPED keeps it near-term without changing progress.
 * No DB/clock dependency (caller passes `now`) so it is deterministically unit-testable.
 */
export const REVISION_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;
export const REVISION_MASTERY_REVIEWS = REVISION_INTERVALS_DAYS.length; // 5 successful reviews → mastered

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

export interface ScheduleResult {
  reviewCount: number;
  status: 'PENDING' | 'DONE';
  dueAt: Date | null;
}

/**
 * Due date for a freshly-added item — **due immediately** so it surfaces in the queue right
 * away (e.g. "review your wrong answers now"). The growing intervals kick in after the first
 * review.
 */
export function initialDueAt(now: Date): Date {
  return new Date(now.getTime());
}

export function scheduleNextReview(
  reviewCount: number,
  outcome: RevisionOutcomeT,
  now: Date,
): ScheduleResult {
  if (outcome === 'CORRECT') {
    const nextCount = reviewCount + 1;
    if (nextCount >= REVISION_MASTERY_REVIEWS) {
      return { reviewCount: nextCount, status: 'DONE', dueAt: null };
    }
    const days = REVISION_INTERVALS_DAYS[nextCount] ?? REVISION_INTERVALS_DAYS[REVISION_INTERVALS_DAYS.length - 1] ?? 35;
    return { reviewCount: nextCount, status: 'PENDING', dueAt: addDays(now, days) };
  }

  if (outcome === 'WRONG') {
    // Reset progress; revisit soon.
    return { reviewCount: 0, status: 'PENDING', dueAt: addDays(now, REVISION_INTERVALS_DAYS[0]) };
  }

  // SKIPPED — keep progress, revisit soon.
  return { reviewCount, status: 'PENDING', dueAt: addDays(now, REVISION_INTERVALS_DAYS[0]) };
}
