import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { PracticeAnswerJobData } from './practice-analytics.constants';

/**
 * Aggregation writes for practice analytics (run off the request path by the worker):
 * updates per-question metrics and appends to the event store.
 */
@Injectable()
export class PracticeAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordAnswer(data: PracticeAnswerJobData): Promise<void> {
    const existing = await this.prisma.questionMetrics.findUnique({
      where: { questionId: data.questionId },
    });

    const attempts = (existing?.attempts ?? 0) + 1;
    const correctCount = (existing?.correctCount ?? 0) + (data.isCorrect ? 1 : 0);
    const correctRate = attempts > 0 ? correctCount / attempts : null;

    let avgTimeMs = existing?.avgTimeMs ?? null;
    if (data.timeMs !== null) {
      const prevCount = existing?.attempts ?? 0;
      avgTimeMs =
        existing?.avgTimeMs == null
          ? data.timeMs
          : Math.round((existing.avgTimeMs * prevCount + data.timeMs) / (prevCount + 1));
    }

    await this.prisma.questionMetrics.upsert({
      where: { questionId: data.questionId },
      update: { attempts, correctCount, correctRate, avgTimeMs },
      create: { questionId: data.questionId, attempts, correctCount, correctRate, avgTimeMs },
    });

    await this.prisma.event.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        type: PRACTICE_ANSWERED_EVENT,
        entityType: 'question',
        entityId: data.questionId,
        payload: { isCorrect: data.isCorrect, timeMs: data.timeMs } as Prisma.InputJsonValue,
      },
    });
  }
}

const PRACTICE_ANSWERED_EVENT = 'practice.answered';
