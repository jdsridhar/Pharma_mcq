import type { AnswerSpec, QuestionTypeT } from '@pharmacy/contracts';
import { evaluateAnswer, type StudentAnswerInput } from '../../../common/evaluation/answer-evaluator';

/**
 * Pure attempt scorer. Operates over immutable snapshots (never live questions), applies
 * marks + negative marking, and treats a missing/empty answer as skipped (0 marks). Reuses
 * the shared `evaluateAnswer` engine. No DB — fully unit-testable.
 */

export interface ScorableItem {
  snapshotId: string;
  questionType: QuestionTypeT;
  answerSpec: AnswerSpec;
  options: { id: string; isCorrect: boolean }[];
  marks: number;
  negativeMarks: number;
  answer?: StudentAnswerInput;
}

export interface ScoredItem {
  snapshotId: string;
  isCorrect: boolean;
  marksAwarded: number;
  answered: boolean;
}

export interface AttemptScore {
  score: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  accuracy: number;
  items: ScoredItem[];
}

function isEmptyAnswer(answer: StudentAnswerInput): boolean {
  return (
    (!answer.selectedOptionIds || answer.selectedOptionIds.length === 0) &&
    answer.booleanAnswer === undefined &&
    answer.numericAnswer === undefined &&
    (!answer.matchingAnswer || answer.matchingAnswer.length === 0)
  );
}

export function scoreAttempt(items: ScorableItem[]): AttemptScore {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  const scored: ScoredItem[] = [];

  for (const item of items) {
    maxScore += item.marks;

    if (!item.answer || isEmptyAnswer(item.answer)) {
      skippedCount += 1;
      scored.push({ snapshotId: item.snapshotId, isCorrect: false, marksAwarded: 0, answered: false });
      continue;
    }

    const { isCorrect } = evaluateAnswer(
      { questionType: item.questionType, answerSpec: item.answerSpec, options: item.options },
      item.answer,
    );
    const marksAwarded = isCorrect ? item.marks : -item.negativeMarks;
    score += marksAwarded;
    if (isCorrect) {
      correctCount += 1;
    } else {
      wrongCount += 1;
    }
    scored.push({ snapshotId: item.snapshotId, isCorrect, marksAwarded, answered: true });
  }

  const accuracy = items.length > 0 ? correctCount / items.length : 0;
  return { score, maxScore, correctCount, wrongCount, skippedCount, accuracy, items: scored };
}

/** Cohort ranking: rank = #scores strictly higher + 1; percentile = % of cohort at-or-below. */
export function computeRank(
  cohortScores: number[],
  score: number,
): { rank: number; percentile: number; cohortSize: number } {
  const cohortSize = cohortScores.length;
  if (cohortSize === 0) {
    return { rank: 1, percentile: 100, cohortSize: 0 };
  }
  const higher = cohortScores.filter((s) => s > score).length;
  const atOrBelow = cohortScores.filter((s) => s <= score).length;
  return { rank: higher + 1, percentile: (atOrBelow / cohortSize) * 100, cohortSize };
}
