import type { AnswerSpec, QuestionTypeT } from '@pharmacy/contracts';

/**
 * Pure answer-evaluation engine: a strategy per question type that scores a student answer
 * against a question version's `answerSpec` (+ options for choice types). No DB, no DI — so
 * it is trivially unit-testable and shared by Practice (Phase 9) and Assessment (Phase 10,
 * over immutable snapshots).
 */

export interface EvaluableOption {
  id: string;
  isCorrect: boolean;
}

export interface EvaluableQuestion {
  questionType: QuestionTypeT;
  answerSpec: AnswerSpec;
  options: EvaluableOption[];
}

export interface StudentAnswerInput {
  selectedOptionIds?: string[];
  booleanAnswer?: boolean;
  numericAnswer?: number;
  matchingAnswer?: { left: string; right: string }[];
}

export interface EvaluationResult {
  isCorrect: boolean;
  /** Correct option ids (choice types) — returned for post-answer feedback. */
  correctOptionIds: string[];
}

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((x) => setB.has(x)) && new Set(a).size === a.length;
}

export function evaluateAnswer(
  question: EvaluableQuestion,
  answer: StudentAnswerInput,
): EvaluationResult {
  const correctOptionIds = question.options.filter((o) => o.isCorrect).map((o) => o.id);

  switch (question.questionType) {
    case 'SINGLE_CHOICE':
    case 'ASSERTION_REASON': {
      const selected = answer.selectedOptionIds ?? [];
      const isCorrect =
        selected.length === 1 && correctOptionIds.length === 1 && selected[0] === correctOptionIds[0];
      return { isCorrect, correctOptionIds };
    }

    case 'MULTI_CHOICE': {
      const selected = answer.selectedOptionIds ?? [];
      const isCorrect = correctOptionIds.length > 0 && setEquals(selected, correctOptionIds);
      return { isCorrect, correctOptionIds };
    }

    case 'TRUE_FALSE': {
      const expected = question.answerSpec.type === 'TRUE_FALSE' ? question.answerSpec.answer : undefined;
      return { isCorrect: answer.booleanAnswer !== undefined && answer.booleanAnswer === expected, correctOptionIds: [] };
    }

    case 'NUMERIC': {
      if (question.answerSpec.type !== 'NUMERIC' || answer.numericAnswer === undefined) {
        return { isCorrect: false, correctOptionIds: [] };
      }
      const { value, tolerance } = question.answerSpec;
      return { isCorrect: Math.abs(answer.numericAnswer - value) <= tolerance, correctOptionIds: [] };
    }

    case 'MATCHING': {
      if (question.answerSpec.type !== 'MATCHING' || !answer.matchingAnswer) {
        return { isCorrect: false, correctOptionIds: [] };
      }
      const expected = new Map(question.answerSpec.pairs.map((p) => [p.left.trim(), p.right.trim()]));
      const given = answer.matchingAnswer;
      let isCorrect = given.length === expected.size;
      if (isCorrect) {
        for (const pair of given) {
          if (expected.get(pair.left.trim()) !== pair.right.trim()) {
            isCorrect = false;
            break;
          }
        }
      }
      return { isCorrect, correctOptionIds: [] };
    }

    default:
      return { isCorrect: false, correctOptionIds: [] };
  }
}
