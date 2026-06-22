import type { RecommendationHistory } from '@prisma/client';
import type { RecommendationRepository } from './repositories/recommendation.repository';
import { RecommendationService } from './recommendation.service';
import type { MasteryRow } from './weak-areas/weak-areas';

const weakRow: MasteryRow = {
  knowledgeNodeId: 'n1',
  code: 'N1',
  name: 'Pharmacology',
  accuracy: 0.4,
  masteryScore: 0.3,
};

function makeRepoMock() {
  return {
    listActiveRules: jest.fn().mockResolvedValue([]),
    getMasteryRows: jest.fn().mockResolvedValue([weakRow]),
    countDueRevision: jest.fn().mockResolvedValue(0),
    hasPublishedMockTest: jest.fn().mockResolvedValue(false),
    examKnowledgeNodeIds: jest.fn(),
    writeHistory: jest.fn().mockResolvedValue(undefined),
    recentHistory: jest.fn(),
  };
}

describe('RecommendationService', () => {
  let repo: ReturnType<typeof makeRepoMock>;
  let service: RecommendationService;

  beforeEach(() => {
    repo = makeRepoMock();
    service = new RecommendationService(repo as unknown as RecommendationRepository);
  });

  it('generates default recommendations (weak area first by priority) and logs history', async () => {
    repo.countDueRevision.mockResolvedValue(3);
    repo.hasPublishedMockTest.mockResolvedValue(true);

    const recs = await service.generate('u1');
    expect(recs[0]?.type).toBe('PRACTICE_WEAK_AREA');
    expect(recs.map((r) => r.type)).toEqual(
      expect.arrayContaining(['PRACTICE_WEAK_AREA', 'REVISE_DUE', 'TAKE_MOCK']),
    );
    expect(recs[0]?.knowledgeNodeId).toBe('n1');
    expect(repo.writeHistory).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ userId: 'u1', type: 'PRACTICE_WEAK_AREA' })]),
    );
  });

  it('honours active rules to restrict which generators run', async () => {
    repo.listActiveRules.mockResolvedValue([{ definition: { type: 'REVISE_DUE' }, priority: 90 }]);
    repo.countDueRevision.mockResolvedValue(2);

    const recs = await service.generate('u1');
    expect(recs).toHaveLength(1);
    expect(recs[0]?.type).toBe('REVISE_DUE');
  });

  it('maps recent history back to recommendations', async () => {
    repo.recentHistory.mockResolvedValue([
      {
        type: 'PRACTICE_WEAK_AREA',
        payload: { title: 'Practice Pharmacology', detail: 'x', priority: 100, knowledgeNodeId: 'n1' },
      } as unknown as RecommendationHistory,
    ]);
    const recent = await service.getRecent('u1');
    expect(recent[0]).toMatchObject({ type: 'PRACTICE_WEAK_AREA', title: 'Practice Pharmacology', knowledgeNodeId: 'n1' });
  });

  it('builds a study plan (mixed practice when no weak areas)', async () => {
    repo.getMasteryRows.mockResolvedValue([]);
    const plan = await service.buildPlan('u1', { days: 3, dailyQuestions: 10 });
    expect(plan.days).toHaveLength(3);
    expect(plan.totalQuestions).toBe(30);
  });
});
