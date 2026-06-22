import type { AnalyticsRepository } from './repositories/analytics.repository';
import { MasteryService } from './mastery.service';

function makeRepoMock() {
  return {
    getUserAnswers: jest.fn(),
    getKnowledgeMapForQuestions: jest.fn(),
    upsertMastery: jest.fn().mockResolvedValue(undefined),
    getMyMastery: jest.fn(),
    overviewCounts: jest.fn(),
    masteryCounts: jest.fn(),
  };
}

describe('MasteryService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: MasteryService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new MasteryService(repo as unknown as AnalyticsRepository);
  });

  it('returns 0 nodes when the user has no answers', async () => {
    repo.getUserAnswers.mockResolvedValue([]);
    expect(await service.recompute('u1')).toEqual({ nodes: 0 });
    expect(repo.upsertMastery).not.toHaveBeenCalled();
  });

  it('aggregates answers per knowledge node and upserts mastery', async () => {
    repo.getUserAnswers.mockResolvedValue([
      { questionId: 'q1', isCorrect: true, timeMs: 1000 },
      { questionId: 'q1', isCorrect: false, timeMs: 2000 },
      { questionId: 'q2', isCorrect: true, timeMs: null },
    ]);
    repo.getKnowledgeMapForQuestions.mockResolvedValue(
      new Map([
        ['q1', ['n1']],
        ['q2', ['n1', 'n2']],
      ]),
    );

    const result = await service.recompute('u1');
    expect(result.nodes).toBe(2);
    // n1 saw 3 attempts (q1 x2 + q2), 2 correct.
    expect(repo.upsertMastery).toHaveBeenCalledWith(
      'u1',
      'n1',
      expect.objectContaining({ accuracy: expect.any(Number), masteryScore: expect.any(Number) }),
    );
    expect(repo.upsertMastery).toHaveBeenCalledWith('u1', 'n2', expect.objectContaining({ accuracy: 1 }));
  });

  it('builds an overview from counts', async () => {
    repo.overviewCounts.mockResolvedValue({
      practiceAnswered: 8,
      practiceCorrect: 6,
      testAnswered: 2,
      testCorrect: 1,
    });
    repo.masteryCounts.mockResolvedValue({ tracked: 5, mastered: 2 });

    const overview = await service.getOverview('u1');
    expect(overview).toMatchObject({
      totalAnswered: 10,
      correct: 7,
      accuracy: 0.7,
      practiceAnswered: 8,
      testAnswered: 2,
      trackedNodes: 5,
      masteredNodes: 2,
    });
  });
});
