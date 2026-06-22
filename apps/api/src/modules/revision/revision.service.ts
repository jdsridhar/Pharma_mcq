import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AddRevisionItemInput,
  type GenerateFromWrongInput,
  type ListRevisionQueueQuery,
  type Paginated,
  type RevisionGenerateResultDto,
  type RevisionItemDto,
  type ReviewRevisionItemInput,
  type SnoozeRevisionItemInput,
  buildPaginationMeta,
  toSkipTake,
} from '@pharmacy/contracts';
import type { RevisionItemStatus, RevisionQueueItem, RevisionSource } from '@prisma/client';
import { RevisionRepository } from './repositories/revision.repository';
import { initialDueAt, scheduleNextReview } from './scheduler/revision-scheduler';

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_PRIORITY: Record<RevisionSource, number> = {
  WRONG_ANSWER: 3,
  WEAK_TOPIC: 2,
  BOOKMARK: 1,
  TIME_GAP: 1,
};
const DUE_LIMIT = 100;

@Injectable()
export class RevisionService {
  constructor(private readonly repo: RevisionRepository) {}

  async addItem(userId: string, input: AddRevisionItemInput): Promise<RevisionItemDto> {
    const published = await this.repo.findPublishedQuestionIds([input.questionId]);
    if (!published.has(input.questionId)) {
      throw new BadRequestException('Question not found or not published');
    }

    const existing = await this.repo.findItem(userId, input.questionId);
    if (existing) {
      return this.toDto(existing);
    }

    const created = await this.repo.createItem({
      userId,
      questionId: input.questionId,
      source: input.source,
      priority: SOURCE_PRIORITY[input.source],
      dueAt: initialDueAt(new Date()),
    });
    return this.toDto(created);
  }

  async listQueue(userId: string, query: ListRevisionQueueQuery): Promise<Paginated<RevisionItemDto>> {
    const { skip, take } = toSkipTake(query);
    const { items, total } = await this.repo.listQueue(
      userId,
      query.status as RevisionItemStatus | undefined,
      skip,
      take,
    );
    return { items: items.map((i) => this.toDto(i)), meta: buildPaginationMeta(total, query) };
  }

  async listDue(userId: string): Promise<RevisionItemDto[]> {
    const items = await this.repo.listDue(userId, new Date(), DUE_LIMIT);
    return items.map((i) => this.toDto(i));
  }

  async review(
    userId: string,
    itemId: string,
    input: ReviewRevisionItemInput,
  ): Promise<RevisionItemDto> {
    const item = await this.requireOwn(itemId, userId);
    const now = new Date();
    const schedule = scheduleNextReview(item.reviewCount, input.outcome, now);

    await this.repo.appendHistory(userId, item.questionId, input.outcome);
    const updated = await this.repo.updateItem(itemId, {
      reviewCount: schedule.reviewCount,
      status: schedule.status,
      dueAt: schedule.dueAt,
      lastReviewedAt: now,
    });
    return this.toDto(updated);
  }

  async snooze(
    userId: string,
    itemId: string,
    input: SnoozeRevisionItemInput,
  ): Promise<RevisionItemDto> {
    await this.requireOwn(itemId, userId);
    const updated = await this.repo.updateItem(itemId, {
      status: 'SNOOZED',
      dueAt: new Date(Date.now() + input.days * DAY_MS),
    });
    return this.toDto(updated);
  }

  async generateFromWrong(
    userId: string,
    input: GenerateFromWrongInput,
  ): Promise<RevisionGenerateResultDto> {
    const wrongIds = await this.repo.recentWrongQuestionIds(userId, input.limit);
    if (wrongIds.length === 0) {
      return { added: 0 };
    }

    const [published, existing] = await Promise.all([
      this.repo.findPublishedQuestionIds(wrongIds),
      this.repo.existingItemQuestionIds(userId, wrongIds),
    ]);
    const toAdd = wrongIds.filter((id) => published.has(id) && !existing.has(id));

    const now = new Date();
    const added = await this.repo.createItems(
      toAdd.map((questionId) => ({
        userId,
        questionId,
        source: 'WRONG_ANSWER' as RevisionSource,
        priority: SOURCE_PRIORITY.WRONG_ANSWER,
        dueAt: initialDueAt(now),
      })),
    );
    return { added };
  }

  private async requireOwn(itemId: string, userId: string): Promise<RevisionQueueItem> {
    const item = await this.repo.findItemById(itemId);
    if (!item) {
      throw new NotFoundException(`Revision item ${itemId} not found`);
    }
    if (item.userId !== userId) {
      throw new ForbiddenException('Not your revision item');
    }
    return item;
  }

  private toDto(item: RevisionQueueItem): RevisionItemDto {
    return {
      id: item.id,
      questionId: item.questionId,
      source: item.source,
      status: item.status,
      priority: item.priority,
      reviewCount: item.reviewCount,
      dueAt: item.dueAt?.toISOString() ?? null,
      lastReviewedAt: item.lastReviewedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
