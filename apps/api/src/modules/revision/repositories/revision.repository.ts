import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type RevisionItemStatus,
  type RevisionOutcome,
  type RevisionQueueItem,
  type RevisionSource,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface CreateItemData {
  userId: string;
  questionId: string;
  source: RevisionSource;
  priority: number;
  dueAt: Date;
}

@Injectable()
export class RevisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findItem(userId: string, questionId: string): Promise<RevisionQueueItem | null> {
    return this.prisma.revisionQueueItem.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
  }

  findItemById(id: string): Promise<RevisionQueueItem | null> {
    return this.prisma.revisionQueueItem.findUnique({ where: { id } });
  }

  createItem(data: CreateItemData): Promise<RevisionQueueItem> {
    return this.prisma.revisionQueueItem.create({ data });
  }

  updateItem(id: string, data: Prisma.RevisionQueueItemUpdateInput): Promise<RevisionQueueItem> {
    return this.prisma.revisionQueueItem.update({ where: { id }, data });
  }

  async listQueue(
    userId: string,
    status: RevisionItemStatus | undefined,
    skip: number,
    take: number,
  ): Promise<{ items: RevisionQueueItem[]; total: number }> {
    const where: Prisma.RevisionQueueItemWhereInput = { userId, ...(status ? { status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.revisionQueueItem.findMany({
        where,
        skip,
        take,
        orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      }),
      this.prisma.revisionQueueItem.count({ where }),
    ]);
    return { items, total };
  }

  listDue(userId: string, now: Date, take: number): Promise<RevisionQueueItem[]> {
    return this.prisma.revisionQueueItem.findMany({
      where: { userId, status: { in: ['PENDING', 'SNOOZED'] }, dueAt: { lte: now } },
      orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }],
      take,
    });
  }

  async appendHistory(userId: string, questionId: string, outcome: RevisionOutcome): Promise<void> {
    await this.prisma.revisionHistory.create({ data: { userId, questionId, outcome } });
  }

  async findPublishedQuestionIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.question.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED', deletedAt: null, currentVersionId: { not: null } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  async existingItemQuestionIds(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.revisionQueueItem.findMany({
      where: { userId, questionId: { in: ids } },
      select: { questionId: true },
    });
    return new Set(rows.map((r) => r.questionId));
  }

  async createItems(items: CreateItemData[]): Promise<number> {
    if (items.length === 0) {
      return 0;
    }
    const result = await this.prisma.revisionQueueItem.createMany({ data: items, skipDuplicates: true });
    return result.count;
  }

  async recentWrongQuestionIds(userId: string, limit: number): Promise<string[]> {
    const [practice, test] = await this.prisma.$transaction([
      this.prisma.practiceAnswer.findMany({
        where: { isCorrect: false, session: { userId } },
        select: { questionId: true },
        orderBy: { answeredAt: 'desc' },
        take: limit,
      }),
      this.prisma.testAnswer.findMany({
        where: { isCorrect: false, testSession: { userId } },
        select: { snapshot: { select: { questionId: true } } },
        orderBy: { answeredAt: 'desc' },
        take: limit,
      }),
    ]);

    const ids = new Set<string>();
    for (const row of practice) {
      ids.add(row.questionId);
    }
    for (const row of test) {
      if (row.snapshot.questionId) {
        ids.add(row.snapshot.questionId);
      }
    }
    return [...ids].slice(0, limit);
  }
}
