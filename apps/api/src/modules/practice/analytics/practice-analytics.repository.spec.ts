import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { PracticeAnalyticsRepository } from './practice-analytics.repository';

function makePrismaMock(existing: unknown) {
  return {
    questionMetrics: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockResolvedValue({}),
    },
    event: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('PracticeAnalyticsRepository', () => {
  it('initializes metrics on first answer and appends an event', async () => {
    const prisma = makePrismaMock(null);
    const repo = new PracticeAnalyticsRepository(prisma as unknown as PrismaService);

    await repo.recordAnswer({ userId: 'u1', organizationId: null, questionId: 'q1', isCorrect: true, timeMs: 1000 });

    expect(prisma.questionMetrics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { questionId: 'q1' },
        create: expect.objectContaining({ attempts: 1, correctCount: 1, correctRate: 1, avgTimeMs: 1000 }),
      }),
    );
    expect(prisma.event.create).toHaveBeenCalled();
  });

  it('updates a running average and correct-rate on subsequent answers', async () => {
    const prisma = makePrismaMock({ questionId: 'q1', attempts: 1, correctCount: 1, correctRate: 1, avgTimeMs: 1000 });
    const repo = new PracticeAnalyticsRepository(prisma as unknown as PrismaService);

    await repo.recordAnswer({ userId: 'u1', organizationId: null, questionId: 'q1', isCorrect: false, timeMs: 2000 });

    expect(prisma.questionMetrics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ attempts: 2, correctCount: 1, correctRate: 0.5, avgTimeMs: 1500 }),
      }),
    );
  });
});
