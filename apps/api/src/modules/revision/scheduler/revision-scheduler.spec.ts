import {
  REVISION_INTERVALS_DAYS,
  REVISION_MASTERY_REVIEWS,
  initialDueAt,
  scheduleNextReview,
} from './revision-scheduler';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86_400_000);

describe('revision scheduler', () => {
  it('makes a freshly-added item due immediately', () => {
    expect(daysBetween(NOW, initialDueAt(NOW))).toBe(0);
  });

  it('grows the interval on each correct review', () => {
    const first = scheduleNextReview(0, 'CORRECT', NOW);
    expect(first.reviewCount).toBe(1);
    expect(daysBetween(NOW, first.dueAt as Date)).toBe(REVISION_INTERVALS_DAYS[1]); // 3

    const second = scheduleNextReview(1, 'CORRECT', NOW);
    expect(daysBetween(NOW, second.dueAt as Date)).toBe(REVISION_INTERVALS_DAYS[2]); // 7
  });

  it('retires the item once mastered', () => {
    const result = scheduleNextReview(REVISION_MASTERY_REVIEWS - 1, 'CORRECT', NOW);
    expect(result.status).toBe('DONE');
    expect(result.dueAt).toBeNull();
  });

  it('resets progress on a wrong review', () => {
    const result = scheduleNextReview(3, 'WRONG', NOW);
    expect(result.reviewCount).toBe(0);
    expect(result.status).toBe('PENDING');
    expect(daysBetween(NOW, result.dueAt as Date)).toBe(1);
  });

  it('keeps progress but revisits soon on a skip', () => {
    const result = scheduleNextReview(2, 'SKIPPED', NOW);
    expect(result.reviewCount).toBe(2);
    expect(daysBetween(NOW, result.dueAt as Date)).toBe(1);
  });
});
