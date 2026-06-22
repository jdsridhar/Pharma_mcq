import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

/**
 * Revision contracts. A spaced-repetition queue: items (sourced from wrong answers,
 * bookmarks, weak topics, time gaps) become due over growing intervals; each review records
 * an outcome and reschedules the next due date.
 */

export const REVISION_SOURCES = ['WRONG_ANSWER', 'BOOKMARK', 'WEAK_TOPIC', 'TIME_GAP'] as const;
export const revisionSourceSchema = z.enum(REVISION_SOURCES);
export type RevisionSourceT = z.infer<typeof revisionSourceSchema>;

export const REVISION_OUTCOMES = ['CORRECT', 'WRONG', 'SKIPPED'] as const;
export const revisionOutcomeSchema = z.enum(REVISION_OUTCOMES);
export type RevisionOutcomeT = z.infer<typeof revisionOutcomeSchema>;

export const revisionItemStatusSchema = z.enum(['PENDING', 'DONE', 'SNOOZED']);
export type RevisionItemStatusT = z.infer<typeof revisionItemStatusSchema>;

export const addRevisionItemSchema = z.object({
  questionId: z.string().uuid(),
  source: revisionSourceSchema.default('WRONG_ANSWER'),
});
export type AddRevisionItemInput = z.infer<typeof addRevisionItemSchema>;

export const reviewRevisionItemSchema = z.object({
  outcome: revisionOutcomeSchema,
});
export type ReviewRevisionItemInput = z.infer<typeof reviewRevisionItemSchema>;

export const snoozeRevisionItemSchema = z.object({
  days: z.number().int().min(1).max(60).default(1),
});
export type SnoozeRevisionItemInput = z.infer<typeof snoozeRevisionItemSchema>;

export const listRevisionQueueQuerySchema = paginationQuerySchema.extend({
  status: revisionItemStatusSchema.optional(),
});
export type ListRevisionQueueQuery = z.infer<typeof listRevisionQueueQuerySchema>;

export const generateFromWrongSchema = z.object({
  limit: z.number().int().min(1).max(500).default(50),
});
export type GenerateFromWrongInput = z.infer<typeof generateFromWrongSchema>;

// ── Response DTOs ──
export interface RevisionItemDto {
  id: string;
  questionId: string;
  source: RevisionSourceT;
  status: RevisionItemStatusT;
  priority: number;
  reviewCount: number;
  dueAt: string | null;
  lastReviewedAt: string | null;
  createdAt: string;
}

export interface RevisionGenerateResultDto {
  added: number;
}
