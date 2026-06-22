/**
 * Analytics contracts (response DTOs). The mastery engine derives per-knowledge mastery
 * from a student's answers; topic/question metrics aggregate platform-wide performance.
 */

export interface MasteryEntryDto {
  knowledgeNodeId: string;
  code: string;
  name: string;
  accuracy: number;
  speedMsAvg: number | null;
  retention: number;
  masteryScore: number;
  updatedAt: string;
}

export interface MasteryOverviewDto {
  totalAnswered: number;
  correct: number;
  accuracy: number;
  practiceAnswered: number;
  testAnswered: number;
  trackedNodes: number;
  masteredNodes: number;
}

export interface RecomputeMasteryResultDto {
  nodes: number;
}

export interface TopicMetricsDto {
  knowledgeNodeId: string;
  attempts: number;
  correctRate: number | null;
  avgTimeMs: number | null;
  updatedAt: string | null;
}

export interface QuestionMetricsDto {
  questionId: string;
  attempts: number;
  correctCount: number;
  skipCount: number;
  correctRate: number | null;
  avgTimeMs: number | null;
  difficultyScore: number | null;
  updatedAt: string | null;
}

/** Mastery threshold: a node is "mastered" at or above this score. */
export const MASTERY_THRESHOLD = 0.8;
