import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { contentStatusSchema, type ContentStatusT } from '../question/question';

/**
 * Learning contracts. A LearningTrack is an ordered sequence of Modules (a guided study
 * path), optionally tied to an exam. Modules map onto the knowledge graph; questions map to
 * modules; and each student has per-module progress.
 */

export const trackCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

export const createLearningTrackSchema = z.object({
  code: trackCodeSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  examProfileId: z.string().uuid().optional(),
  status: contentStatusSchema.default('DRAFT'),
});
export type CreateLearningTrackInput = z.infer<typeof createLearningTrackSchema>;

export const updateLearningTrackSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    examProfileId: z.string().uuid().nullable().optional(),
    status: contentStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateLearningTrackInput = z.infer<typeof updateLearningTrackSchema>;

export const listLearningTracksQuerySchema = paginationQuerySchema.extend({
  status: contentStatusSchema.optional(),
  examProfileId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListLearningTracksQuery = z.infer<typeof listLearningTracksQuerySchema>;

export const createTrackModuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  displayOrder: z.number().int().min(0).default(0),
});
export type CreateTrackModuleInput = z.infer<typeof createTrackModuleSchema>;

export const updateTrackModuleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateTrackModuleInput = z.infer<typeof updateTrackModuleSchema>;

export const setTrackModuleKnowledgeSchema = z.object({
  knowledgeNodeIds: z.array(z.string().uuid()).max(100),
});
export type SetTrackModuleKnowledgeInput = z.infer<typeof setTrackModuleKnowledgeSchema>;

export const trackProgressStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
export type TrackProgressStatusT = z.infer<typeof trackProgressStatusSchema>;

export const setTrackProgressSchema = z.object({ status: trackProgressStatusSchema });
export type SetTrackProgressInput = z.infer<typeof setTrackProgressSchema>;

// ── Response DTOs ──
export interface TrackModuleDto {
  id: string;
  trackId: string;
  name: string;
  description: string | null;
  displayOrder: number;
  createdAt: string;
}

export interface LearningTrackDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  examProfileId: string | null;
  status: ContentStatusT;
  createdAt: string;
  updatedAt: string;
}

export interface LearningTrackDetailDto extends LearningTrackDto {
  modules: TrackModuleDto[];
}

export interface TrackProgressDto {
  trackModuleId: string;
  status: TrackProgressStatusT;
  completedAt: string | null;
  updatedAt: string | null;
}
