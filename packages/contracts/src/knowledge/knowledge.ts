import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination';

/**
 * Knowledge graph contracts. The graph is intentionally generic: a node's `type` is a
 * free-form string (DOMAIN/CONCEPT/DRUG/…) — never a hardcoded taxonomy — and edges carry
 * a relationship type. Hierarchical relationships must stay acyclic (a DAG).
 */

export const KNOWLEDGE_RELATIONSHIP_TYPES = [
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
  'RELATED_TO',
] as const;

export const relationshipTypeSchema = z.enum(KNOWLEDGE_RELATIONSHIP_TYPES);
export type KnowledgeRelationshipTypeT = z.infer<typeof relationshipTypeSchema>;

/** Relationship types that define the hierarchy and are kept acyclic. RELATED_TO is associative. */
export const HIERARCHICAL_RELATIONSHIP_TYPES = [
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
] as const satisfies readonly KnowledgeRelationshipTypeT[];

export const knowledgeNodeCodeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Code must be 2–64 chars: uppercase letters, digits, dot, underscore or hyphen',
  );

export const knowledgeNodeTypeSchema = z.string().trim().min(1).max(64);

export const createKnowledgeNodeSchema = z.object({
  code: knowledgeNodeCodeSchema,
  name: z.string().trim().min(2).max(200),
  type: knowledgeNodeTypeSchema,
  description: z.string().trim().max(2000).optional(),
});
export type CreateKnowledgeNodeInput = z.infer<typeof createKnowledgeNodeSchema>;

export const updateKnowledgeNodeSchema = z
  .object({
    // `code` is immutable after creation.
    name: z.string().trim().min(2).max(200).optional(),
    type: knowledgeNodeTypeSchema.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateKnowledgeNodeInput = z.infer<typeof updateKnowledgeNodeSchema>;

export const listKnowledgeNodesQuerySchema = paginationQuerySchema.extend({
  type: knowledgeNodeTypeSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
});
export type ListKnowledgeNodesQuery = z.infer<typeof listKnowledgeNodesQuerySchema>;

export const createKnowledgeEdgeSchema = z
  .object({
    parentNodeId: z.string().uuid(),
    childNodeId: z.string().uuid(),
    relationshipType: relationshipTypeSchema,
    weight: z.number().min(0).max(1).optional(),
  })
  .refine((value) => value.parentNodeId !== value.childNodeId, {
    message: 'An edge cannot link a node to itself',
    path: ['childNodeId'],
  });
export type CreateKnowledgeEdgeInput = z.infer<typeof createKnowledgeEdgeSchema>;

/** Graph traversal options. `relationshipTypes` accepts a CSV query string or an array. */
export const graphTraversalQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(20).default(5),
  relationshipTypes: z
    .union([z.string(), z.array(relationshipTypeSchema)])
    .optional()
    .transform((value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    )
    .pipe(z.array(relationshipTypeSchema).nonempty().optional()),
});
export type GraphTraversalQuery = z.infer<typeof graphTraversalQuerySchema>;

// ── Response DTOs (timestamps serialized as ISO strings) ──
export interface KnowledgeNodeDto {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEdgeDto {
  id: string;
  parentNodeId: string;
  childNodeId: string;
  relationshipType: KnowledgeRelationshipTypeT;
  weight: number | null;
  createdAt: string;
}
