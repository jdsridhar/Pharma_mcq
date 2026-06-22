import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { RevisionQueueItem } from '@prisma/client';
import type { RevisionRepository } from './repositories/revision.repository';
import { RevisionService } from './revision.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function item(overrides: Partial<RevisionQueueItem> = {}): RevisionQueueItem {
  return {
    id: 'r1',
    userId: 'u1',
    questionId: 'q1',
    source: 'WRONG_ANSWER',
    priority: 3,
    status: 'PENDING',
    dueAt: NOW,
    lastReviewedAt: null,
    reviewCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRepoMock() {
  return {
    findPublishedQuestionIds: jest.fn(),
    findItem: jest.fn(),
    findItemById: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    listQueue: jest.fn(),
    listDue: jest.fn(),
    appendHistory: jest.fn().mockResolvedValue(undefined),
    existingItemQuestionIds: jest.fn(),
    createItems: jest.fn(),
    recentWrongQuestionIds: jest.fn(),
  };
}

describe('RevisionService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: RevisionService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new RevisionService(repo as unknown as RevisionRepository);
  });

  it('rejects adding an unpublished question (400)', async () => {
    repo.findPublishedQuestionIds.mockResolvedValue(new Set<string>());
    await expect(
      service.addItem('u1', { questionId: 'q1', source: 'WRONG_ANSWER' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent when the item already exists', async () => {
    repo.findPublishedQuestionIds.mockResolvedValue(new Set(['q1']));
    repo.findItem.mockResolvedValue(item());
    const dto = await service.addItem('u1', { questionId: 'q1', source: 'WRONG_ANSWER' });
    expect(dto.id).toBe('r1');
    expect(repo.createItem).not.toHaveBeenCalled();
  });

  it('records a review, appends history, and reschedules', async () => {
    repo.findItemById.mockResolvedValue(item({ reviewCount: 0 }));
    repo.updateItem.mockImplementation((_id: string, data: Record<string, unknown>) =>
      Promise.resolve(item({ ...data } as Partial<RevisionQueueItem>)),
    );

    const dto = await service.review('u1', 'r1', { outcome: 'CORRECT' });
    expect(repo.appendHistory).toHaveBeenCalledWith('u1', 'q1', 'CORRECT');
    expect(repo.updateItem).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ reviewCount: 1, status: 'PENDING' }),
    );
    expect(dto.reviewCount).toBe(1);
  });

  it('forbids reviewing another user’s item', async () => {
    repo.findItemById.mockResolvedValue(item({ userId: 'someone-else' }));
    await expect(service.review('u1', 'r1', { outcome: 'CORRECT' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('generate-from-wrong adds only published, not-already-queued questions', async () => {
    repo.recentWrongQuestionIds.mockResolvedValue(['q1', 'q2', 'q3']);
    repo.findPublishedQuestionIds.mockResolvedValue(new Set(['q1', 'q2'])); // q3 unpublished
    repo.existingItemQuestionIds.mockResolvedValue(new Set(['q1'])); // q1 already queued
    repo.createItems.mockResolvedValue(1);

    const result = await service.generateFromWrong('u1', { limit: 50 });
    expect(result.added).toBe(1);
    expect(repo.createItems).toHaveBeenCalledWith([
      expect.objectContaining({ questionId: 'q2', source: 'WRONG_ANSWER' }),
    ]);
  });
});
