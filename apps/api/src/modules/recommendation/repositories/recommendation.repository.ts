import { Injectable } from '@nestjs/common';
import { Prisma, type RecommendationHistory, type RecommendationRule } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { MasteryRow } from '../weak-areas/weak-areas';

export interface CreateRuleData {
  code: string;
  name: string;
  description?: string;
  definition: Prisma.InputJsonValue;
  isActive: boolean;
  priority: number;
}

@Injectable()
export class RecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Rules ──
  createRule(data: CreateRuleData): Promise<RecommendationRule> {
    return this.prisma.recommendationRule.create({ data });
  }

  findRuleById(id: string): Promise<RecommendationRule | null> {
    return this.prisma.recommendationRule.findUnique({ where: { id } });
  }

  async listRules(
    isActive: boolean | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: RecommendationRule[]; total: number }> {
    const where: Prisma.RecommendationRuleWhereInput = isActive === undefined ? {} : { isActive };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.recommendationRule.findMany({
        where,
        skip,
        take,
        orderBy: [{ priority: 'desc' }, { code: 'asc' }],
      }),
      this.prisma.recommendationRule.count({ where }),
    ]);
    return { items, total };
  }

  listActiveRules(): Promise<RecommendationRule[]> {
    return this.prisma.recommendationRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'desc' },
    });
  }

  updateRule(id: string, data: Prisma.RecommendationRuleUpdateInput): Promise<RecommendationRule> {
    return this.prisma.recommendationRule.update({ where: { id }, data });
  }

  async deleteRule(id: string): Promise<void> {
    await this.prisma.recommendationRule.delete({ where: { id } });
  }

  // ── Signals ──
  async getMasteryRows(userId: string): Promise<MasteryRow[]> {
    const rows = await this.prisma.studentMastery.findMany({
      where: { userId },
      include: { knowledgeNode: { select: { code: true, name: true } } },
    });
    return rows.map((r) => ({
      knowledgeNodeId: r.knowledgeNodeId,
      code: r.knowledgeNode.code,
      name: r.knowledgeNode.name,
      accuracy: r.accuracy,
      masteryScore: r.masteryScore,
    }));
  }

  countDueRevision(userId: string, now: Date): Promise<number> {
    return this.prisma.revisionQueueItem.count({
      where: { userId, status: { in: ['PENDING', 'SNOOZED'] }, dueAt: { lte: now } },
    });
  }

  async hasPublishedMockTest(): Promise<boolean> {
    const count = await this.prisma.mockTest.count({ where: { status: 'PUBLISHED' } });
    return count > 0;
  }

  async examKnowledgeNodeIds(examProfileId: string): Promise<Set<string>> {
    const rows = await this.prisma.examKnowledgeMapping.findMany({
      where: { examProfileId },
      select: { knowledgeNodeId: true },
    });
    return new Set(rows.map((r) => r.knowledgeNodeId));
  }

  // ── History ──
  async writeHistory(
    rows: { userId: string; type: string; payload: Prisma.InputJsonValue }[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.prisma.recommendationHistory.createMany({ data: rows });
  }

  recentHistory(userId: string, take: number): Promise<RecommendationHistory[]> {
    return this.prisma.recommendationHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
