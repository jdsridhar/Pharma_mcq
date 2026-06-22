import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { contentStatusSchema, type ContentStatusT } from '../question/question';

/**
 * Exam contracts. An ExamProfile (GPAT, NIPER, …) owns Blueprints; a blueprint is a set of
 * weighted Items (subject/area → weightage, count, difficulty mix) used to assemble tests.
 * Questions map to exam profiles via a mapping table (Golden Rule).
 */

export const examCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

export const createExamProfileSchema = z.object({
  code: examCodeSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  status: contentStatusSchema.default('DRAFT'),
});
export type CreateExamProfileInput = z.infer<typeof createExamProfileSchema>;

export const updateExamProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: contentStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateExamProfileInput = z.infer<typeof updateExamProfileSchema>;

export const listExamProfilesQuerySchema = paginationQuerySchema.extend({
  status: contentStatusSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListExamProfilesQuery = z.infer<typeof listExamProfilesQuerySchema>;

export const setExamKnowledgeSchema = z.object({
  items: z
    .array(z.object({ knowledgeNodeId: z.string().uuid(), importance: z.number().min(0).max(1).optional() }))
    .max(200),
});
export type SetExamKnowledgeInput = z.infer<typeof setExamKnowledgeSchema>;

// ── Blueprints ──
export const createExamBlueprintSchema = z.object({
  name: z.string().trim().min(2).max(200),
  totalQuestions: z.number().int().min(1).max(1000),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  isActive: z.boolean().default(true),
});
export type CreateExamBlueprintInput = z.infer<typeof createExamBlueprintSchema>;

export const updateExamBlueprintSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    totalQuestions: z.number().int().min(1).max(1000).optional(),
    durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateExamBlueprintInput = z.infer<typeof updateExamBlueprintSchema>;

export const difficultyMixSchema = z.object({
  EASY: z.number().int().min(0),
  MEDIUM: z.number().int().min(0),
  HARD: z.number().int().min(0),
});
export type DifficultyMix = z.infer<typeof difficultyMixSchema>;

export const createExamBlueprintItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  weightPercent: z.number().min(0).max(100),
  // Weight-driven: the per-item question count is DERIVED from weightPercent × the blueprint total,
  // so authors don't set it. Accepted but ignored for backward compatibility.
  questionCount: z.number().int().min(0).max(1000).optional(),
  difficultyMix: difficultyMixSchema.optional(),
  knowledgeNodeId: z.string().uuid().optional(),
});
export type CreateExamBlueprintItemInput = z.infer<typeof createExamBlueprintItemSchema>;

export const updateExamBlueprintItemSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    weightPercent: z.number().min(0).max(100).optional(),
    questionCount: z.number().int().min(0).max(1000).optional(),
    difficultyMix: difficultyMixSchema.nullable().optional(),
    knowledgeNodeId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateExamBlueprintItemInput = z.infer<typeof updateExamBlueprintItemSchema>;

// ── Response DTOs ──
export interface ExamProfileDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ContentStatusT;
  createdAt: string;
  updatedAt: string;
}

export interface ExamBlueprintItemDto {
  id: string;
  blueprintId: string;
  label: string;
  weightPercent: number;
  /** Derived from weightPercent × the blueprint total (largest-remainder); not author-set. */
  questionCount: number;
  difficultyMix: DifficultyMix | null;
  knowledgeNodeId: string | null;
}

export interface ExamBlueprintDto {
  id: string;
  examProfileId: string;
  name: string;
  totalQuestions: number;
  durationMinutes: number | null;
  isActive: boolean;
  items: ExamBlueprintItemDto[];
  /** Sum of item weightPercent. A complete, weight-driven blueprint totals 100. */
  weightTotal: number;
  /** True when weightTotal is 100 (±0.01) — the blueprint fully allocates the paper. */
  isReady: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One section of a dry-run blueprint plan: derived target vs. how many questions can be sourced. */
export interface BlueprintPlanSectionDto {
  itemId: string;
  label: string;
  weightPercent: number;
  /** Questions this section should contribute (derived from its weight). */
  targetCount: number;
  /** Published questions actually available for this section's filter, in the viewer's scope. */
  availableCount: number;
  difficultyMix: DifficultyMix | null;
}

/**
 * Author-facing dry run of a blueprint against the live question pool — surfaces under-supply
 * BEFORE a student sits the exam, instead of silently truncating/under-filling at assembly time.
 */
export interface BlueprintPlanDto {
  blueprintId: string;
  totalQuestions: number;
  weightTotal: number;
  /** Sum of section target counts (≈ totalQuestions when weightTotal is 100). */
  plannedCount: number;
  /** Best-case sourceable count = Σ min(target, available) for each section. */
  sourceableCount: number;
  sections: BlueprintPlanSectionDto[];
  warnings: string[];
  /** True when weights total 100 AND every section's pool can satisfy its target. */
  isReady: boolean;
}

export interface ExamKnowledgeMappingDto {
  knowledgeNodeId: string;
  importance: number | null;
}
