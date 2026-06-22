import type { AnswerSpec } from '@pharmacy/contracts';
import { computeRank, scoreAttempt, type ScorableItem } from './score-attempt';

const single = (id: string, marks: number, negativeMarks: number, correctId: string, answer?: string[]): ScorableItem => ({
  snapshotId: id,
  questionType: 'SINGLE_CHOICE',
  answerSpec: { type: 'SINGLE_CHOICE' } as AnswerSpec,
  options: [
    { id: 'x', isCorrect: correctId === 'x' },
    { id: 'y', isCorrect: correctId === 'y' },
  ],
  marks,
  negativeMarks,
  answer: answer ? { selectedOptionIds: answer } : undefined,
});

describe('scoreAttempt', () => {
  it('awards marks for correct, applies negative for wrong, and skips unanswered', () => {
    const result = scoreAttempt([
      single('s1', 4, 1, 'x', ['x']), // correct → +4
      single('s2', 4, 1, 'x', ['y']), // wrong → -1
      single('s3', 4, 1, 'x'), // skipped → 0
    ]);
    expect(result.score).toBe(3);
    expect(result.maxScore).toBe(12);
    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.accuracy).toBeCloseTo(1 / 3);
  });

  it('treats an empty answer object as skipped', () => {
    const result = scoreAttempt([
      { ...single('s1', 4, 1, 'x'), answer: { selectedOptionIds: [] } },
    ]);
    expect(result.skippedCount).toBe(1);
    expect(result.score).toBe(0);
  });
});

describe('computeRank', () => {
  it('ranks by score with percentile at-or-below', () => {
    // cohort already includes this attempt's score (90)
    const stats = computeRank([90, 80, 70, 100], 90);
    expect(stats.rank).toBe(2); // one score (100) is higher
    expect(stats.cohortSize).toBe(4);
    expect(stats.percentile).toBe(75); // 3 of 4 are <= 90
  });

  it('handles an empty cohort', () => {
    expect(computeRank([], 50)).toEqual({ rank: 1, percentile: 100, cohortSize: 0 });
  });
});
