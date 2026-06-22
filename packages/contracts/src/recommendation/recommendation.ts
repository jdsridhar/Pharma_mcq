import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

/**
 * Recommendation contracts. Weak-area detection (from mastery) + configurable rules drive a
 * recommendations feed; a study planner turns weak areas into a day-by-day plan.
 */

export const RECOMMENDATION_TYPES = ['PRACTICE_WEAK_AREA', 'REVISE_DUE', 'TAKE_MOCK'] as const;
export const recommendationTypeSchema = z.enum(RECOMMENDATION_TYPES);
export type RecommendationTypeT = z.infer<typeof recommendationTypeSchema>;

// ── Rules (admin) ──
export const createRecommendationRuleSchema = z.object({
  code: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  definition: z.record(z.string(), z.unknown()).default({}),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(0),
});
export type CreateRecommendationRuleInput = z.infer<typeof createRecommendationRuleSchema>;

export const updateRecommendationRuleSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    definition: z.record(z.string(), z.unknown()).optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateRecommendationRuleInput = z.infer<typeof updateRecommendationRuleSchema>;

export const listRecommendationRulesQuerySchema = paginationQuerySchema.extend({
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListRecommendationRulesQuery = z.infer<typeof listRecommendationRulesQuerySchema>;

// ── Study plan ──
export const studyPlanSchema = z.object({
  examProfileId: z.string().uuid().optional(),
  days: z.number().int().min(1).max(30).default(7),
  dailyQuestions: z.number().int().min(1).max(100).default(20),
});
export type StudyPlanInput = z.infer<typeof studyPlanSchema>;

// ── Response DTOs ──
export interface RecommendationRuleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface WeakAreaDto {
  knowledgeNodeId: string;
  code: string;
  name: string;
  accuracy: number;
  masteryScore: number;
  gap: number;
}

export interface RecommendationDto {
  type: RecommendationTypeT;
  title: string;
  detail: string;
  priority: number;
  knowledgeNodeId: string | null;
}

export interface StudyPlanItemDto {
  knowledgeNodeId: string | null;
  name: string;
  questions: number;
}

export interface StudyPlanDayDto {
  day: number;
  items: StudyPlanItemDto[];
}

export interface StudyPlanDto {
  days: StudyPlanDayDto[];
  totalQuestions: number;
}
