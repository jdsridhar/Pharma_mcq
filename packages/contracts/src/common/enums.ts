/**
 * Structural enumerations that are part of the platform's *shape* (not business data
 * like exam/curriculum names, which must never be hardcoded). These mirror DB enums.
 */

/** Content lifecycle (Administration Domain → Content Workflow). */
export const ContentStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ContentStatus = (typeof ContentStatus)[keyof typeof ContentStatus];

/**
 * Question structural types. Drives the strategy-pattern scoring engine.
 * (See ARCHITECTURE_REVIEW.md finding L-1 + answer_spec.)
 */
export const QuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTI_CHOICE: 'MULTI_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  NUMERIC: 'NUMERIC',
  ASSERTION_REASON: 'ASSERTION_REASON',
  MATCHING: 'MATCHING',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

/** Knowledge-graph edge semantics (Knowledge Domain). Hierarchical types form a DAG. */
export const KnowledgeRelationship = {
  IS_A: 'IS_A',
  PART_OF: 'PART_OF',
  PREREQUISITE_OF: 'PREREQUISITE_OF',
  RELATED_TO: 'RELATED_TO',
} as const;
export type KnowledgeRelationship =
  (typeof KnowledgeRelationship)[keyof typeof KnowledgeRelationship];

/** Edge types that must remain acyclic and participate in mastery roll-ups. */
export const HIERARCHICAL_RELATIONSHIPS: readonly KnowledgeRelationship[] = [
  KnowledgeRelationship.IS_A,
  KnowledgeRelationship.PART_OF,
  KnowledgeRelationship.PREREQUISITE_OF,
];
