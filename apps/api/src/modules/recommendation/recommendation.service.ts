import { Injectable } from '@nestjs/common';
import {
  RECOMMENDATION_TYPES,
  type RecommendationDto,
  type RecommendationTypeT,
  type StudyPlanDto,
  type StudyPlanInput,
  type WeakAreaDto,
} from '@pharmacy/contracts';
import { Prisma } from '@prisma/client';
import { buildStudyPlan } from './planner/study-planner';
import { RecommendationRepository } from './repositories/recommendation.repository';
import { rankWeakAreas } from './weak-areas/weak-areas';

interface EnabledGenerator {
  type: RecommendationTypeT;
  priority: number;
  limit: number;
}

const DEFAULT_GENERATORS: EnabledGenerator[] = [
  { type: 'PRACTICE_WEAK_AREA', priority: 100, limit: 5 },
  { type: 'REVISE_DUE', priority: 80, limit: 0 },
  { type: 'TAKE_MOCK', priority: 50, limit: 0 },
];

@Injectable()
export class RecommendationService {
  constructor(private readonly repo: RecommendationRepository) {}

  async getWeakAreas(userId: string): Promise<WeakAreaDto[]> {
    return rankWeakAreas(await this.repo.getMasteryRows(userId));
  }

  /** Build the recommendations feed from active rules + signals, and log to history. */
  async generate(userId: string): Promise<RecommendationDto[]> {
    const rules = await this.repo.listActiveRules();
    const generators = this.resolveGenerators(rules);
    const masteryRows = await this.repo.getMasteryRows(userId);
    const now = new Date();
    const recs: RecommendationDto[] = [];

    for (const gen of generators) {
      if (gen.type === 'PRACTICE_WEAK_AREA') {
        for (const w of rankWeakAreas(masteryRows, { limit: gen.limit || 5 })) {
          recs.push({
            type: 'PRACTICE_WEAK_AREA',
            title: `Practice ${w.name}`,
            detail: `Mastery ${(w.masteryScore * 100).toFixed(0)}% — focus here to improve.`,
            priority: gen.priority,
            knowledgeNodeId: w.knowledgeNodeId,
          });
        }
      } else if (gen.type === 'REVISE_DUE') {
        const due = await this.repo.countDueRevision(userId, now);
        if (due > 0) {
          recs.push({
            type: 'REVISE_DUE',
            title: `${due} item(s) due for revision`,
            detail: 'Clear your revision queue to retain what you have learned.',
            priority: gen.priority,
            knowledgeNodeId: null,
          });
        }
      } else if (gen.type === 'TAKE_MOCK' && (await this.repo.hasPublishedMockTest())) {
        recs.push({
          type: 'TAKE_MOCK',
          title: 'Attempt a mock test',
          detail: 'Benchmark yourself under timed, exam-like conditions.',
          priority: gen.priority,
          knowledgeNodeId: null,
        });
      }
    }

    recs.sort((a, b) => b.priority - a.priority);
    await this.repo.writeHistory(
      recs.map((r) => ({
        userId,
        type: r.type,
        payload: {
          title: r.title,
          detail: r.detail,
          priority: r.priority,
          knowledgeNodeId: r.knowledgeNodeId,
        } as Prisma.InputJsonValue,
      })),
    );
    return recs;
  }

  async getRecent(userId: string): Promise<RecommendationDto[]> {
    const history = await this.repo.recentHistory(userId, 20);
    return history.map((h) => {
      const payload = (h.payload ?? {}) as {
        title?: string;
        detail?: string;
        priority?: number;
        knowledgeNodeId?: string | null;
      };
      return {
        type: h.type as RecommendationTypeT,
        title: payload.title ?? '',
        detail: payload.detail ?? '',
        priority: payload.priority ?? 0,
        knowledgeNodeId: payload.knowledgeNodeId ?? null,
      };
    });
  }

  async buildPlan(userId: string, input: StudyPlanInput): Promise<StudyPlanDto> {
    let rows = await this.repo.getMasteryRows(userId);
    if (input.examProfileId) {
      const examNodes = await this.repo.examKnowledgeNodeIds(input.examProfileId);
      rows = rows.filter((r) => examNodes.has(r.knowledgeNodeId));
    }
    const weak = rankWeakAreas(rows, { limit: input.days * 3 });
    return buildStudyPlan(
      weak.map((w) => ({ knowledgeNodeId: w.knowledgeNodeId, name: w.name })),
      { days: input.days, dailyQuestions: input.dailyQuestions },
    );
  }

  private resolveGenerators(
    rules: { definition: Prisma.JsonValue; priority: number }[],
  ): EnabledGenerator[] {
    if (rules.length === 0) {
      return DEFAULT_GENERATORS;
    }
    const known = RECOMMENDATION_TYPES as readonly string[];
    const resolved: EnabledGenerator[] = [];
    for (const rule of rules) {
      const def = (rule.definition ?? {}) as { type?: string; limit?: number };
      if (def.type && known.includes(def.type)) {
        resolved.push({
          type: def.type as RecommendationTypeT,
          priority: rule.priority,
          limit: typeof def.limit === 'number' ? def.limit : 5,
        });
      }
    }
    return resolved.length > 0 ? resolved : DEFAULT_GENERATORS;
  }
}
