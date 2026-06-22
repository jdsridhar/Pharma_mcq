import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';
import { contentStatusSchema, type ContentStatusT } from '../question/question';

/**
 * Curriculum contracts. A curriculum is an ordered TREE of nodes (Subject → Chapter →
 * Topic, etc.) whose leaves/nodes map onto the shared knowledge graph. Questions map to
 * curriculum nodes via a mapping table (Golden Rule).
 */

export const curriculumCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

export const createCurriculumSchema = z.object({
  code: curriculumCodeSchema,
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  status: contentStatusSchema.default('DRAFT'),
});
export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>;

export const updateCurriculumSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: contentStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateCurriculumInput = z.infer<typeof updateCurriculumSchema>;

export const listCurriculumsQuerySchema = paginationQuerySchema.extend({
  status: contentStatusSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListCurriculumsQuery = z.infer<typeof listCurriculumsQuerySchema>;

export const createCurriculumNodeSchema = z.object({
  parentId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  code: z.string().trim().max(64).optional(),
  displayOrder: z.number().int().min(0).default(0),
});
export type CreateCurriculumNodeInput = z.infer<typeof createCurriculumNodeSchema>;

export const updateCurriculumNodeSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().max(64).nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
    // null re-parents to root; a uuid re-parents under another node (same curriculum).
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateCurriculumNodeInput = z.infer<typeof updateCurriculumNodeSchema>;

export const setCurriculumNodeKnowledgeSchema = z.object({
  knowledgeNodeIds: z.array(z.string().uuid()).max(100),
});
export type SetCurriculumNodeKnowledgeInput = z.infer<typeof setCurriculumNodeKnowledgeSchema>;

// ── Response DTOs ──
export interface CurriculumDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ContentStatusT;
  createdAt: string;
  updatedAt: string;
}

export interface CurriculumNodeDto {
  id: string;
  curriculumId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  displayOrder: number;
}

export interface CurriculumTreeNodeDto extends CurriculumNodeDto {
  children: CurriculumTreeNodeDto[];
}
