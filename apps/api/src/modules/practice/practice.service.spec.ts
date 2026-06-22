import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { PracticeAnswer, PracticeSession } from '@prisma/client';
import type { PracticeAnalyticsProducer } from './analytics/practice-analytics.producer';
import type { PracticeRepository, ServedVersionRow } from './repositories/practice.repository';
import { PracticeService } from './practice.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');

function session(overrides: Partial<PracticeSession> = {}): PracticeSession {
  return {
    id: 's1',
    userId: 'u1',
    organizationId: null,
    status: 'IN_PROGRESS',
    config: null,
    startedAt: NOW,
    completedAt: null,
    createdAt: NOW,
    ...overrides,
  } as PracticeSession;
}

function servedVersion(): ServedVersionRow {
  return {
    id: 'v1',
    questionId: 'q1',
    versionNumber: 1,
    questionText: 'What is aspirin?',
    explanation: 'It is an NSAID.',
    answerSpec: { type: 'SINGLE_CHOICE' },
    normalizedTextHash: 'h',
    status: 'PUBLISHED',
    createdById: null,
    createdAt: NOW,
    options: [
      { id: 'a', questionVersionId: 'v1', optionText: 'NSAID', isCorrect: true, displayOrder: 0, createdAt: NOW },
      { id: 'b', questionVersionId: 'v1', optionText: 'PPI', isCorrect: false, displayOrder: 1, createdAt: NOW },
    ],
    media: [],
    question: { questionType: 'SINGLE_CHOICE' },
  } as unknown as ServedVersionRow;
}

function makeRepoMock() {
  return {
    findPublishedCandidates: jest.fn(),
    createSession: jest.fn(),
    findSessionById: jest.fn(),
    findSessionQuestions: jest.fn(),
    findSessionQuestionById: jest.fn(),
    findServedVersions: jest.fn(),
    findServedVersionById: jest.fn(),
    listSessions: jest.fn(),
    updateSessionStatus: jest.fn(),
    upsertAnswer: jest.fn(),
    findAnswers: jest.fn(),
    countAnswered: jest.fn(),
    getKnowledgeMapForQuestions: jest.fn(),
  };
}

describe('PracticeService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let analytics: { recordAnswer: jest.Mock };
  let service: PracticeService;

  beforeEach(() => {
    repo = makeRepoMock();
    analytics = { recordAnswer: jest.fn().mockResolvedValue(undefined) };
    service = new PracticeService(
      repo as unknown as PracticeRepository,
      analytics as unknown as PracticeAnalyticsProducer,
    );
  });

  it('rejects starting a session with no matching questions (400)', async () => {
    repo.findPublishedCandidates.mockResolvedValue([]);
    await expect(service.start('u1', null, { count: 10 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids submitting to another user’s session', async () => {
    repo.findSessionById.mockResolvedValue(session({ userId: 'someone-else' }));
    await expect(
      service.submitAnswer('s1', 'u1', { sessionQuestionId: 'sq1', selectedOptionIds: ['a'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects answering a session that is not in progress (409)', async () => {
    repo.findSessionById.mockResolvedValue(session({ status: 'COMPLETED' }));
    await expect(
      service.submitAnswer('s1', 'u1', { sessionQuestionId: 'sq1', selectedOptionIds: ['a'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('scores a correct answer, persists it, and enqueues analytics', async () => {
    repo.findSessionById.mockResolvedValue(session());
    repo.findSessionQuestionById.mockResolvedValue({
      id: 'sq1',
      sessionId: 's1',
      questionId: 'q1',
      servedVersionId: 'v1',
      displayOrder: 0,
    });
    repo.findServedVersionById.mockResolvedValue(servedVersion());
    repo.upsertAnswer.mockResolvedValue({} as PracticeAnswer);

    const result = await service.submitAnswer('s1', 'u1', {
      sessionQuestionId: 'sq1',
      selectedOptionIds: ['a'],
      timeMs: 1200,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.correctOptionIds).toEqual(['a']);
    expect(result.explanation).toBe('It is an NSAID.');
    expect(repo.upsertAnswer).toHaveBeenCalledWith(
      's1',
      'q1',
      expect.objectContaining({ isCorrect: true, timeMs: 1200 }),
    );
    expect(analytics.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'q1', isCorrect: true, timeMs: 1200 }),
    );
  });

  it('computes a summary with a per-knowledge breakdown', async () => {
    repo.findSessionById.mockResolvedValue(session());
    repo.findSessionQuestions.mockResolvedValue([{ id: 'sq1' }, { id: 'sq2' }]);
    repo.findAnswers.mockResolvedValue([
      { questionId: 'qa', isCorrect: true, timeMs: 1000 },
      { questionId: 'qb', isCorrect: false, timeMs: 2000 },
    ] as unknown as PracticeAnswer[]);
    repo.getKnowledgeMapForQuestions.mockResolvedValue(
      new Map([
        ['qa', ['n1']],
        ['qb', ['n1']],
      ]),
    );

    const summary = await service.summary('s1', 'u1');
    expect(summary).toMatchObject({ total: 2, answered: 2, correct: 1, incorrect: 1, accuracy: 0.5, avgTimeMs: 1500 });
    expect(summary.byKnowledgeNode).toEqual([
      { knowledgeNodeId: 'n1', total: 2, correct: 1, accuracy: 0.5 },
    ]);
  });
});
