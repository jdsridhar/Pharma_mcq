import { Injectable, NotFoundException } from '@nestjs/common';
import type { QuestionMetricsDto, TopicMetricsDto } from '@pharmacy/contracts';
import { AnalyticsRepository } from './repositories/analytics.repository';

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  /** Aggregate topic metrics from the question metrics of questions mapped to the node. */
  async getTopicMetrics(knowledgeNodeId: string): Promise<TopicMetricsDto> {
    if (!(await this.repo.nodeExists(knowledgeNodeId))) {
      throw new NotFoundException(`Knowledge node ${knowledgeNodeId} not found`);
    }
    const agg = await this.repo.topicAggregate(knowledgeNodeId);
    const correctRate = agg.attempts > 0 ? Number((agg.correct / agg.attempts).toFixed(4)) : null;
    await this.repo.upsertTopicMetrics(knowledgeNodeId, {
      attempts: agg.attempts,
      correctRate,
      avgTimeMs: agg.avgTimeMs,
    });
    return {
      knowledgeNodeId,
      attempts: agg.attempts,
      correctRate,
      avgTimeMs: agg.avgTimeMs,
      updatedAt: new Date().toISOString(),
    };
  }

  async getQuestionMetrics(questionId: string): Promise<QuestionMetricsDto> {
    const metrics = await this.repo.getQuestionMetrics(questionId);
    if (!metrics) {
      return {
        questionId,
        attempts: 0,
        correctCount: 0,
        skipCount: 0,
        correctRate: null,
        avgTimeMs: null,
        difficultyScore: null,
        updatedAt: null,
      };
    }
    return {
      questionId: metrics.questionId,
      attempts: metrics.attempts,
      correctCount: metrics.correctCount,
      skipCount: metrics.skipCount,
      correctRate: metrics.correctRate ?? null,
      avgTimeMs: metrics.avgTimeMs ?? null,
      difficultyScore: metrics.difficultyScore ?? null,
      updatedAt: metrics.updatedAt.toISOString(),
    };
  }
}
