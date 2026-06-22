import type { AnswerSpec } from '@pharmacy/contracts';
import { type EvaluableQuestion, evaluateAnswer } from './answer-evaluator';

const opts = (correctIds: string[], all: string[]): EvaluableQuestion['options'] =>
  all.map((id) => ({ id, isCorrect: correctIds.includes(id) }));

describe('evaluateAnswer', () => {
  it('SINGLE_CHOICE: correct only when the single right option is chosen', () => {
    const q: EvaluableQuestion = {
      questionType: 'SINGLE_CHOICE',
      answerSpec: { type: 'SINGLE_CHOICE' } as AnswerSpec,
      options: opts(['a'], ['a', 'b', 'c']),
    };
    expect(evaluateAnswer(q, { selectedOptionIds: ['a'] }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { selectedOptionIds: ['b'] }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, { selectedOptionIds: ['a', 'b'] }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, {}).isCorrect).toBe(false);
    expect(evaluateAnswer(q, { selectedOptionIds: ['a'] }).correctOptionIds).toEqual(['a']);
  });

  it('MULTI_CHOICE: correct only on the exact set', () => {
    const q: EvaluableQuestion = {
      questionType: 'MULTI_CHOICE',
      answerSpec: { type: 'MULTI_CHOICE' } as AnswerSpec,
      options: opts(['a', 'c'], ['a', 'b', 'c']),
    };
    expect(evaluateAnswer(q, { selectedOptionIds: ['a', 'c'] }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { selectedOptionIds: ['c', 'a'] }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { selectedOptionIds: ['a'] }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, { selectedOptionIds: ['a', 'b', 'c'] }).isCorrect).toBe(false);
  });

  it('TRUE_FALSE: matches the boolean answer', () => {
    const q: EvaluableQuestion = {
      questionType: 'TRUE_FALSE',
      answerSpec: { type: 'TRUE_FALSE', answer: true },
      options: [],
    };
    expect(evaluateAnswer(q, { booleanAnswer: true }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { booleanAnswer: false }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, {}).isCorrect).toBe(false);
  });

  it('NUMERIC: within tolerance', () => {
    const q: EvaluableQuestion = {
      questionType: 'NUMERIC',
      answerSpec: { type: 'NUMERIC', value: 42, tolerance: 0.5 },
      options: [],
    };
    expect(evaluateAnswer(q, { numericAnswer: 42 }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { numericAnswer: 42.4 }).isCorrect).toBe(true);
    expect(evaluateAnswer(q, { numericAnswer: 43 }).isCorrect).toBe(false);
    expect(evaluateAnswer(q, {}).isCorrect).toBe(false);
  });

  it('MATCHING: all pairs must match (order-independent)', () => {
    const q: EvaluableQuestion = {
      questionType: 'MATCHING',
      answerSpec: {
        type: 'MATCHING',
        pairs: [
          { left: 'Aspirin', right: 'NSAID' },
          { left: 'Omeprazole', right: 'PPI' },
        ],
      },
      options: [],
    };
    expect(
      evaluateAnswer(q, {
        matchingAnswer: [
          { left: 'Omeprazole', right: 'PPI' },
          { left: 'Aspirin', right: 'NSAID' },
        ],
      }).isCorrect,
    ).toBe(true);
    expect(
      evaluateAnswer(q, {
        matchingAnswer: [
          { left: 'Aspirin', right: 'PPI' },
          { left: 'Omeprazole', right: 'NSAID' },
        ],
      }).isCorrect,
    ).toBe(false);
    expect(evaluateAnswer(q, { matchingAnswer: [{ left: 'Aspirin', right: 'NSAID' }] }).isCorrect).toBe(
      false,
    );
  });
});
