import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { difficultySchema, type QuestionMediaDto, type QuestionTypeT } from '../question/question';

/**
 * Practice contracts. Untimed self-study: a student starts a session from a filtered pool of
 * PUBLISHED questions, answers them with immediate feedback, and gets a summary. Served
 * questions never include correctness — feedback is returned only after an answer is submitted.
 */

/** Max questions a single practice session may contain. */
export const PRACTICE_MAX_QUESTIONS = 500;

export const startPracticeSessionSchema = z.object({
  knowledgeNodeIds: z.array(z.string().uuid()).max(50).optional(),
  examProfileId: z.string().uuid().optional(),
  trackModuleId: z.string().uuid().optional(),
  curriculumNodeId: z.string().uuid().optional(),
  tagIds: z.array(z.string().uuid()).max(50).optional(),
  difficulty: difficultySchema.optional(),
  count: z.number().int().min(1).max(PRACTICE_MAX_QUESTIONS).default(10),
});
export type StartPracticeSessionInput = z.infer<typeof startPracticeSessionSchema>;

/** Query for "how many published questions match these filters" (drives the count field). */
export const practiceAvailableQuerySchema = z.object({
  knowledgeNodeId: z.string().uuid().optional(),
  examProfileId: z.string().uuid().optional(),
  trackModuleId: z.string().uuid().optional(),
  curriculumNodeId: z.string().uuid().optional(),
  difficulty: difficultySchema.optional(),
});
export type PracticeAvailableQuery = z.infer<typeof practiceAvailableQuerySchema>;

export interface PracticeAvailableDto {
  /** Published questions matching the filters (in the viewer's scope). */
  available: number;
  /** Hard ceiling for one session (PRACTICE_MAX_QUESTIONS). */
  max: number;
}

/** A student's answer payload — the relevant field is chosen by the question's type. */
export const studentAnswerSchema = z.object({
  selectedOptionIds: z.array(z.string().uuid()).max(20).optional(),
  booleanAnswer: z.boolean().optional(),
  numericAnswer: z.number().optional(),
  matchingAnswer: z
    .array(z.object({ left: z.string().min(1), right: z.string().min(1) }))
    .max(20)
    .optional(),
});
export type StudentAnswer = z.infer<typeof studentAnswerSchema>;

export const submitPracticeAnswerSchema = studentAnswerSchema.extend({
  sessionQuestionId: z.string().uuid(),
  timeMs: z.number().int().min(0).max(86_400_000).optional(),
});
export type SubmitPracticeAnswerInput = z.infer<typeof submitPracticeAnswerSchema>;

export const listPracticeSessionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED']).optional(),
});
export type ListPracticeSessionsQuery = z.infer<typeof listPracticeSessionsQuerySchema>;

// ── Response DTOs ──
export type PracticeSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

/** Option as served during practice — NO `isCorrect` (would leak the answer). */
export interface PracticeOptionDto {
  id: string;
  optionText: string;
  displayOrder: number;
}

/** A served question — withholds answer, explanation and answerSpec. */
export interface PracticeQuestionDto {
  sessionQuestionId: string;
  questionId: string;
  displayOrder: number;
  questionType: QuestionTypeT;
  questionText: string;
  options: PracticeOptionDto[];
  media: QuestionMediaDto[];
  /** For MATCHING: the prompts and a shuffled list of candidate answers (no pairing). */
  matchingPrompt?: { lefts: string[]; rights: string[] };
}

export interface PracticeSessionDto {
  id: string;
  status: PracticeSessionStatus;
  startedAt: string;
  completedAt: string | null;
  totalQuestions: number;
  answeredCount: number;
}

export interface PracticeSessionDetailDto extends PracticeSessionDto {
  questions: PracticeQuestionDto[];
}

/** Returned after submitting an answer — includes feedback. */
export interface PracticeAnswerResultDto {
  sessionQuestionId: string;
  questionId: string;
  isCorrect: boolean;
  correctOptionIds: string[];
  explanation: string | null;
  answeredAt: string;
}

export interface PracticeKnowledgeBreakdownDto {
  knowledgeNodeId: string;
  total: number;
  correct: number;
  accuracy: number;
}

export interface PracticeSummaryDto {
  sessionId: string;
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  avgTimeMs: number | null;
  byKnowledgeNode: PracticeKnowledgeBreakdownDto[];
}
