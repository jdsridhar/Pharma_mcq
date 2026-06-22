import { Injectable } from '@nestjs/common';
import {
  MASTERY_THRESHOLD,
  type MasteryEntryDto,
  type MasteryOverviewDto,
  type RecomputeMasteryResultDto,
} from '@pharmacy/contracts';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { computeMastery } from './mastery/mastery';

@Injectable()
export class MasteryService {
  constructor(private readonly repo: AnalyticsRepository) {}

  /** Recompute the user's per-knowledge mastery from all of their scored answers. */
  async recompute(userId: string): Promise<RecomputeMasteryResultDto> {
    const answers = await this.repo.getUserAnswers(userId);
    if (answers.length === 0) {
      return { nodes: 0 };
    }

    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const knowledgeMap = await this.repo.getKnowledgeMapForQuestions(questionIds);

    const agg = new Map<string, { attempts: number; correct: number; timeSum: number; timeCount: number }>();
    for (const answer of answers) {
      for (const nodeId of knowledgeMap.get(answer.questionId) ?? []) {
        const entry = agg.get(nodeId) ?? { attempts: 0, correct: 0, timeSum: 0, timeCount: 0 };
        entry.attempts += 1;
        if (answer.isCorrect) {
          entry.correct += 1;
        }
        if (answer.timeMs !== null) {
          entry.timeSum += answer.timeMs;
          entry.timeCount += 1;
        }
        agg.set(nodeId, entry);
      }
    }

    for (const [nodeId, stats] of agg.entries()) {
      const result = computeMastery({
        attempts: stats.attempts,
        correct: stats.correct,
        avgTimeMs: stats.timeCount > 0 ? Math.round(stats.timeSum / stats.timeCount) : null,
      });
      await this.repo.upsertMastery(userId, nodeId, result);
    }

    return { nodes: agg.size };
  }

  async getMyMastery(userId: string): Promise<MasteryEntryDto[]> {
    const rows = await this.repo.getMyMastery(userId);
    return rows.map((row) => ({
      knowledgeNodeId: row.knowledgeNodeId,
      code: row.knowledgeNode.code,
      name: row.knowledgeNode.name,
      accuracy: row.accuracy,
      speedMsAvg: row.speedMsAvg ?? null,
      retention: row.retention ?? row.accuracy,
      masteryScore: row.masteryScore,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async getOverview(userId: string): Promise<MasteryOverviewDto> {
    const [counts, mastery] = await Promise.all([
      this.repo.overviewCounts(userId),
      this.repo.masteryCounts(userId),
    ]);
    const totalAnswered = counts.practiceAnswered + counts.testAnswered;
    const correct = counts.practiceCorrect + counts.testCorrect;
    return {
      totalAnswered,
      correct,
      accuracy: totalAnswered > 0 ? Number((correct / totalAnswered).toFixed(4)) : 0,
      practiceAnswered: counts.practiceAnswered,
      testAnswered: counts.testAnswered,
      trackedNodes: mastery.tracked,
      masteredNodes: mastery.mastered,
    };
  }

  /** Exposed for callers that want the mastery threshold (e.g. UI badges). */
  get masteryThreshold(): number {
    return MASTERY_THRESHOLD;
  }
}
