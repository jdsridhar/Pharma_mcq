import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

/**
 * Question domain contracts. A Question is the stable identity (code/type/status); its
 * editable content lives in versioned `QuestionVersion`s. The correct answer is described
 * by a typed `answerSpec` (a discriminated union on question type).
 *
 * GOLDEN RULE: a question carries no exam/curriculum FK — only mapping tables.
 */

export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'NUMERIC',
  'ASSERTION_REASON',
  'MATCHING',
] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionTypeT = z.infer<typeof questionTypeSchema>;

/** Question types whose correctness is carried by the option list. */
export const CHOICE_QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'ASSERTION_REASON'] as const;

export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export type DifficultyT = z.infer<typeof difficultySchema>;

export const contentStatusSchema = z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED']);
export type ContentStatusT = z.infer<typeof contentStatusSchema>;

export const mediaTypeSchema = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'PDF']);

// ── answerSpec (discriminated union by `type`) ──
const choiceMarker = (type: (typeof CHOICE_QUESTION_TYPES)[number]) => z.object({ type: z.literal(type) });

export const answerSpecSchema = z.discriminatedUnion('type', [
  choiceMarker('SINGLE_CHOICE'),
  choiceMarker('MULTI_CHOICE'),
  choiceMarker('ASSERTION_REASON'),
  z.object({ type: z.literal('TRUE_FALSE'), answer: z.boolean() }),
  z.object({
    type: z.literal('NUMERIC'),
    value: z.number(),
    tolerance: z.number().min(0).default(0),
  }),
  z.object({
    type: z.literal('MATCHING'),
    pairs: z
      .array(z.object({ left: z.string().trim().min(1).max(500), right: z.string().trim().min(1).max(500) }))
      .min(2)
      .max(20),
  }),
]);
export type AnswerSpec = z.infer<typeof answerSpecSchema>;

export const optionInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean().default(false),
  displayOrder: z.number().int().min(0).optional(),
});

export const mediaInputSchema = z.object({
  mediaType: mediaTypeSchema,
  url: z.string().url().max(2000),
  altText: z.string().trim().max(500).optional(),
  displayOrder: z.number().int().min(0).default(0),
});

export const questionCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

// Shared content object (used for both create and new-version).
const questionContentObject = z.object({
  questionType: questionTypeSchema,
  authorDifficulty: difficultySchema.default('MEDIUM'),
  language: z.string().trim().min(2).max(10).default('en'),
  questionText: z.string().trim().min(3).max(8000),
  explanation: z.string().trim().max(8000).optional(),
  answerSpec: answerSpecSchema,
  options: z.array(optionInputSchema).max(10).optional(),
  media: z.array(mediaInputSchema).max(10).optional(),
});

/** Cross-field validation: answerSpec must match the type, and options must match the type. */
function refineContent(
  data: z.infer<typeof questionContentObject>,
  ctx: z.RefinementCtx,
): void {
  if (data.answerSpec.type !== data.questionType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['answerSpec', 'type'],
      message: `answerSpec.type must equal questionType (${data.questionType})`,
    });
  }

  const options = data.options ?? [];
  const isChoice = (CHOICE_QUESTION_TYPES as readonly string[]).includes(data.questionType);
  if (isChoice) {
    if (options.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'At least 2 options are required' });
    }
    const correct = options.filter((o) => o.isCorrect).length;
    if (data.questionType === 'MULTI_CHOICE') {
      if (correct < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'At least one correct option is required' });
      }
    } else if (correct !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Exactly one correct option is required' });
    }
  } else if (options.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: `${data.questionType} questions must not have options`,
    });
  }
}

export const createVersionSchema = questionContentObject.superRefine(refineContent);
export type CreateVersionInput = z.infer<typeof createVersionSchema>;

export const createQuestionSchema = questionContentObject
  .extend({ questionCode: questionCodeSchema })
  .superRefine(refineContent);
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionMetaSchema = z
  .object({
    authorDifficulty: difficultySchema.optional(),
    language: z.string().trim().min(2).max(10).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateQuestionMetaInput = z.infer<typeof updateQuestionMetaSchema>;

export const listQuestionsQuerySchema = paginationQuerySchema.extend({
  status: contentStatusSchema.optional(),
  type: questionTypeSchema.optional(),
  knowledgeNodeId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

export const setKnowledgeMappingsSchema = z.object({
  items: z
    .array(z.object({ knowledgeNodeId: z.string().uuid(), weight: z.number().min(0).max(1).optional() }))
    .max(50),
});
export type SetKnowledgeMappingsInput = z.infer<typeof setKnowledgeMappingsSchema>;

export const setTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(50)).max(30),
});
export type SetTagsInput = z.infer<typeof setTagsSchema>;

/** Question → curriculum-node mappings (implemented in the Curriculum domain, Phase 6). */
export const setCurriculumMappingsSchema = z.object({
  items: z.array(z.object({ curriculumNodeId: z.string().uuid() })).max(100),
});
export type SetCurriculumMappingsInput = z.infer<typeof setCurriculumMappingsSchema>;

/** Question → exam-profile mappings (implemented in the Exam domain, Phase 7). */
export const setExamMappingsSchema = z.object({
  items: z
    .array(z.object({ examProfileId: z.string().uuid(), relevance: z.number().min(0).max(1).optional() }))
    .max(50),
});
export type SetExamMappingsInput = z.infer<typeof setExamMappingsSchema>;

/** Question → track-module mappings (implemented in the Learning domain, Phase 8). */
export const setTrackMappingsSchema = z.object({
  items: z.array(z.object({ trackModuleId: z.string().uuid() })).max(100),
});
export type SetTrackMappingsInput = z.infer<typeof setTrackMappingsSchema>;

export const checkDuplicateQuerySchema = z.object({
  text: z.string().trim().min(3).max(8000),
  threshold: z.coerce.number().min(0).max(1).default(0.6),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
export type CheckDuplicateQuery = z.infer<typeof checkDuplicateQuerySchema>;

// ── Bulk workflow actions (e.g. bulk accept/reject/publish from the admin list) ──
export const QUESTION_BULK_ACTIONS = ['submit', 'approve', 'reject', 'publish', 'archive', 'delete'] as const;
export const questionBulkActionSchema = z.enum(QUESTION_BULK_ACTIONS);
export type QuestionBulkAction = z.infer<typeof questionBulkActionSchema>;

export const bulkQuestionActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  action: questionBulkActionSchema,
  /** Optional reason recorded for a reject (and reusable for audit). */
  reason: z.string().trim().max(500).optional(),
});
export type BulkQuestionActionInput = z.infer<typeof bulkQuestionActionSchema>;

export interface BulkActionItemResult {
  id: string;
  ok: boolean;
  error: string | null;
}
export interface BulkActionResultDto {
  action: QuestionBulkAction;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkActionItemResult[];
}

/**
 * Canonical text normalization for duplicate detection — shared by client and server so a
 * hash computed anywhere matches. Lower-cases, NFKC-normalizes, strips punctuation, and
 * collapses whitespace.
 */
export function normalizeQuestionText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Response DTOs ──
export interface QuestionOptionDto {
  id: string;
  optionText: string;
  isCorrect: boolean;
  displayOrder: number;
}

export interface QuestionMediaDto {
  id: string;
  mediaType: z.infer<typeof mediaTypeSchema>;
  url: string;
  altText: string | null;
  displayOrder: number;
}

export interface QuestionVersionDto {
  id: string;
  versionNumber: number;
  questionText: string;
  explanation: string | null;
  answerSpec: AnswerSpec;
  status: ContentStatusT;
  normalizedTextHash: string;
  createdAt: string;
  options: QuestionOptionDto[];
  media: QuestionMediaDto[];
}

export interface QuestionSummaryDto {
  id: string;
  questionCode: string;
  questionType: QuestionTypeT;
  status: ContentStatusT;
  authorDifficulty: DifficultyT;
  calculatedDifficulty: number | null;
  language: string;
  currentVersionId: string | null;
  createdById: string | null;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionDetailDto extends QuestionSummaryDto {
  workingVersion: QuestionVersionDto | null;
  currentVersion: QuestionVersionDto | null;
  knowledgeNodeIds: string[];
  curriculumNodeIds: string[];
  examProfileIds: string[];
  trackModuleIds: string[];
  tags: string[];
}

export interface DuplicateCandidateDto {
  questionId: string;
  questionCode: string;
  similarity: number;
  questionText: string;
}
