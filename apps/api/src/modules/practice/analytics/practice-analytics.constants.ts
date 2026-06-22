/** Job name + payload for asynchronous practice-answer analytics. */
export const PRACTICE_ANSWER_JOB = 'practice.answer-recorded';

export interface PracticeAnswerJobData {
  userId: string;
  organizationId: string | null;
  questionId: string;
  isCorrect: boolean;
  timeMs: number | null;
}
