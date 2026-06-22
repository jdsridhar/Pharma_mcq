import { Injectable } from '@nestjs/common';
import { MASTERY_THRESHOLD } from '@pharmacy/contracts';
import { Prisma, type QuestionMetrics } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface UserAnswerRow {
  questionId: string;
  isCorrect: boolean;
  timeMs: number | null;
}

export type MasteryWithNode = Prisma.StudentMasteryGetPayload<{
  include: { knowledgeNode: { select: { code: true; name: true } } };
}>;

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUserAnswers(userId: string): Promise<UserAnswerRow[]> {
    const [practice, test] = await this.prisma.$transaction([
      this.prisma.practiceAnswer.findMany({
        where: { isCorrect: { not: null }, session: { userId } },
        select: { questionId: true, isCorrect: true, timeMs: true },
      }),
      this.prisma.testAnswer.findMany({
        where: { isCorrect: { not: null }, testSession: { userId } },
        select: { isCorrect: true, timeMs: true, snapshot: { select: { questionId: true } } },
      }),
    ]);

    const rows: UserAnswerRow[] = [];
    for (const p of practice) {
      rows.push({ questionId: p.questionId, isCorrect: p.isCorrect === true, timeMs: p.timeMs });
    }
    for (const t of test) {
      if (t.snapshot.questionId) {
        rows.push({ questionId: t.snapshot.questionId, isCorrect: t.isCorrect === true, timeMs: t.timeMs });
      }
    }
    return rows;
  }

  async getKnowledgeMapForQuestions(questionIds: string[]): Promise<Map<string, string[]>> {
    if (questionIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.questionKnowledgeMapping.findMany({
      where: { questionId: { in: questionIds } },
      select: { questionId: true, knowledgeNodeId: true },
    });
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const list = map.get(row.questionId) ?? [];
      list.push(row.knowledgeNodeId);
      map.set(row.questionId, list);
    }
    return map;
  }

  async upsertMastery(
    userId: string,
    knowledgeNodeId: string,
    data: { accuracy: number; speedMsAvg: number | null; retention: number; masteryScore: number },
  ): Promise<void> {
    await this.prisma.studentMastery.upsert({
      where: { userId_knowledgeNodeId: { userId, knowledgeNodeId } },
      update: data,
      create: { userId, knowledgeNodeId, ...data },
    });
  }

  getMyMastery(userId: string): Promise<MasteryWithNode[]> {
    return this.prisma.studentMastery.findMany({
      where: { userId },
      include: { knowledgeNode: { select: { code: true, name: true } } },
      orderBy: { masteryScore: 'desc' },
    });
  }

  async overviewCounts(userId: string): Promise<{
    practiceAnswered: number;
    practiceCorrect: number;
    testAnswered: number;
    testCorrect: number;
  }> {
    const [practiceAnswered, practiceCorrect, testAnswered, testCorrect] =
      await this.prisma.$transaction([
        this.prisma.practiceAnswer.count({ where: { isCorrect: { not: null }, session: { userId } } }),
        this.prisma.practiceAnswer.count({ where: { isCorrect: true, session: { userId } } }),
        this.prisma.testAnswer.count({ where: { isCorrect: { not: null }, testSession: { userId } } }),
        this.prisma.testAnswer.count({ where: { isCorrect: true, testSession: { userId } } }),
      ]);
    return { practiceAnswered, practiceCorrect, testAnswered, testCorrect };
  }

  async masteryCounts(userId: string): Promise<{ tracked: number; mastered: number }> {
    const [tracked, mastered] = await this.prisma.$transaction([
      this.prisma.studentMastery.count({ where: { userId } }),
      this.prisma.studentMastery.count({ where: { userId, masteryScore: { gte: MASTERY_THRESHOLD } } }),
    ]);
    return { tracked, mastered };
  }

  async nodeExists(knowledgeNodeId: string): Promise<boolean> {
    const found = await this.prisma.knowledgeNode.findFirst({
      where: { id: knowledgeNodeId, deletedAt: null },
      select: { id: true },
    });
    return found !== null;
  }

  async topicAggregate(
    knowledgeNodeId: string,
  ): Promise<{ attempts: number; correct: number; avgTimeMs: number | null }> {
    const rows = await this.prisma.questionMetrics.findMany({
      where: { question: { deletedAt: null, knowledgeMappings: { some: { knowledgeNodeId } } } },
      select: { attempts: true, correctCount: true, avgTimeMs: true },
    });
    let attempts = 0;
    let correct = 0;
    let timeWeighted = 0;
    let timeAttempts = 0;
    for (const row of rows) {
      attempts += row.attempts;
      correct += row.correctCount;
      if (row.avgTimeMs !== null && row.attempts > 0) {
        timeWeighted += row.avgTimeMs * row.attempts;
        timeAttempts += row.attempts;
      }
    }
    return { attempts, correct, avgTimeMs: timeAttempts > 0 ? Math.round(timeWeighted / timeAttempts) : null };
  }

  async upsertTopicMetrics(
    knowledgeNodeId: string,
    data: { attempts: number; correctRate: number | null; avgTimeMs: number | null },
  ): Promise<void> {
    await this.prisma.topicMetrics.upsert({
      where: { knowledgeNodeId },
      update: data,
      create: { knowledgeNodeId, ...data },
    });
  }

  getQuestionMetrics(questionId: string): Promise<QuestionMetrics | null> {
    return this.prisma.questionMetrics.findUnique({ where: { questionId } });
  }
}
