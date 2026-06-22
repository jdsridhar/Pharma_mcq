import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { studentAnswerSchema } from '../practice/practice';
import {
  type AnswerSpec,
  contentStatusSchema,
  type ContentStatusT,
  difficultySchema,
  type QuestionMediaDto,
  type QuestionTypeT,
} from '../question/question';

/**
 * Assessment contracts. A MockTest is a SHARED definition (the ranking cohort); each attempt
 * is a per-user TestSession that FREEZES an immutable snapshot of every served question, so
 * scoring/regrading never depends on the live (editable) question. (§7-B)
 */

export const MOCK_TEST_MODES = ['FIXED', 'BLUEPRINT'] as const;
export const mockTestModeSchema = z.enum(MOCK_TEST_MODES);
export type MockTestModeT = z.infer<typeof mockTestModeSchema>;

export const mockTestCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

export const createMockTestSchema = z
  .object({
    code: mockTestCodeSchema,
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    mode: mockTestModeSchema.default('FIXED'),
    durationMinutes: z.number().int().min(1).max(1440),
    // FIXED mocks derive their count from the attached question set (omitted → an empty shell);
    // BLUEPRINT mocks declare the target the blueprint fills to (validated below).
    totalQuestions: z.number().int().min(0).max(1000).optional(),
    examProfileId: z.string().uuid().optional(),
    blueprintId: z.string().uuid().optional(),
    opensAt: z.string().datetime({ offset: true }).optional(),
    closesAt: z.string().datetime({ offset: true }).optional(),
    status: contentStatusSchema.default('DRAFT'),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'BLUEPRINT') {
      if (!v.blueprintId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blueprintId'], message: 'BLUEPRINT mode requires a blueprintId' });
      }
      if (!v.totalQuestions || v.totalQuestions < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['totalQuestions'], message: 'BLUEPRINT mode requires totalQuestions ≥ 1' });
      }
    }
  });
export type CreateMockTestInput = z.infer<typeof createMockTestSchema>;

export const updateMockTestSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    totalQuestions: z.number().int().min(1).max(1000).optional(),
    opensAt: z.string().datetime({ offset: true }).nullable().optional(),
    closesAt: z.string().datetime({ offset: true }).nullable().optional(),
    status: contentStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateMockTestInput = z.infer<typeof updateMockTestSchema>;

export const listMockTestsQuerySchema = paginationQuerySchema.extend({
  status: contentStatusSchema.optional(),
  mode: mockTestModeSchema.optional(),
  examProfileId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListMockTestsQuery = z.infer<typeof listMockTestsQuerySchema>;

export const setMockTestQuestionsSchema = z.object({
  items: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        marks: z.number().min(0).max(100).default(1),
        negativeMarks: z.number().min(0).max(100).default(0),
      }),
    )
    .min(1)
    .max(500),
});
export type SetMockTestQuestionsInput = z.infer<typeof setMockTestQuestionsSchema>;

/** Ad-hoc timed test (no cohort ranking). */
export const startAdHocTestSchema = z.object({
  examProfileId: z.string().uuid().optional(),
  knowledgeNodeIds: z.array(z.string().uuid()).max(50).optional(),
  difficulty: difficultySchema.optional(),
  count: z.number().int().min(1).max(200).default(20),
  durationMinutes: z.number().int().min(1).max(1440).default(30),
});
export type StartAdHocTestInput = z.infer<typeof startAdHocTestSchema>;

export const submitTestAnswerSchema = studentAnswerSchema.extend({
  snapshotId: z.string().uuid(),
  timeMs: z.number().int().min(0).max(86_400_000).optional(),
});
export type SubmitTestAnswerInput = z.infer<typeof submitTestAnswerSchema>;

export const listTestSessionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED']).optional(),
});
export type ListTestSessionsQuery = z.infer<typeof listTestSessionsQuerySchema>;

// ── Snapshot (stored full incl. correctness; served stripped) ──
export interface AssessmentSnapshotOption {
  id: string;
  optionText: string;
  isCorrect: boolean;
  displayOrder: number;
}
export interface AssessmentSnapshot {
  questionType: QuestionTypeT;
  questionText: string;
  explanation: string | null;
  answerSpec: AnswerSpec;
  options: AssessmentSnapshotOption[];
  media: QuestionMediaDto[];
}

// ── Response DTOs ──
export interface MockTestDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  mode: MockTestModeT;
  durationMinutes: number;
  totalQuestions: number;
  examProfileId: string | null;
  blueprintId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  status: ContentStatusT;
  createdAt: string;
  updatedAt: string;
}

export interface MockTestQuestionDto {
  questionId: string;
  marks: number;
  negativeMarks: number;
  displayOrder: number;
}

export interface MockTestDetailDto extends MockTestDto {
  questions: MockTestQuestionDto[];
}

/** A served snapshot — withholds correctness, answerSpec and explanation. */
export interface AssessmentQuestionDto {
  snapshotId: string;
  displayOrder: number;
  questionType: QuestionTypeT;
  questionText: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; optionText: string; displayOrder: number }[];
  media: QuestionMediaDto[];
  matchingPrompt?: { lefts: string[]; rights: string[] };
}

export type TestSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';

export interface TestSessionDto {
  id: string;
  mockTestId: string | null;
  status: TestSessionStatus;
  startedAt: string;
  expiresAt: string | null;
  submittedAt: string | null;
  totalQuestions: number;
  answeredCount: number;
}

export interface TestSessionDetailDto extends TestSessionDto {
  questions: AssessmentQuestionDto[];
}

export interface TestResultDto {
  sessionId: string;
  score: number;
  maxScore: number;
  accuracy: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  timeTakenMs: number | null;
  rank: number | null;
  percentile: number | null;
  cohortSize: number | null;
}
