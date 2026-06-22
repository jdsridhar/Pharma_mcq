import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Result, TestSession } from '@prisma/client';
import type { MockTestRepository } from './repositories/mock-test.repository';
import type { TestSessionRepository } from './repositories/test-session.repository';
import { TestSessionService } from './test-session.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function session(overrides: Partial<TestSession> = {}): TestSession {
  return {
    id: 't1',
    userId: 'u1',
    organizationId: null,
    mockTestId: null,
    status: 'IN_PROGRESS',
    startedAt: NOW,
    submittedAt: null,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    createdAt: NOW,
    ...overrides,
  } as TestSession;
}

function makeMocks() {
  const mockTests = {
    findMockTestById: jest.fn(),
    getMockTestQuestions: jest.fn(),
  };
  const repo = {
    findPublishedCandidates: jest.fn(),
    findSessionById: jest.fn(),
    findResult: jest.fn(),
    cohortScores: jest.fn(),
    updateSessionStatus: jest.fn(),
    findSnapshots: jest.fn(),
    findAnswers: jest.fn(),
    applyAnswerScores: jest.fn(),
    upsertResult: jest.fn(),
  };
  return { mockTests, repo };
}

describe('TestSessionService', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let service: TestSessionService;

  beforeEach(() => {
    mocks = makeMocks();
    service = new TestSessionService(
      mocks.mockTests as unknown as MockTestRepository,
      mocks.repo as unknown as TestSessionRepository,
    );
  });

  it('forbids accessing another user’s session', async () => {
    mocks.repo.findSessionById.mockResolvedValue(session({ userId: 'someone-else' }));
    await expect(service.get('t1', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an ad-hoc test with no matching questions (400)', async () => {
    mocks.repo.findPublishedCandidates.mockResolvedValue([]);
    await expect(
      service.startAdHoc('u1', null, { count: 10, durationMinutes: 30 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent: submitting an already-completed session returns the existing result', async () => {
    mocks.repo.findSessionById.mockResolvedValue(session({ status: 'COMPLETED', mockTestId: null }));
    mocks.repo.findResult.mockResolvedValue({
      testSessionId: 't1',
      score: 8,
      maxScore: 10,
      accuracy: 0.8,
      correctCount: 4,
      wrongCount: 1,
      skippedCount: 0,
      timeTakenMs: 1000,
    } as Result);

    const result = await service.submit('t1', 'u1');
    expect(result.score).toBe(8);
    expect(mocks.repo.updateSessionStatus).not.toHaveBeenCalled();
    expect(mocks.repo.upsertResult).not.toHaveBeenCalled();
  });
});
