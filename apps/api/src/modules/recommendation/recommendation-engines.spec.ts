import { buildStudyPlan } from './planner/study-planner';
import { type MasteryRow, rankWeakAreas } from './weak-areas/weak-areas';

const row = (id: string, accuracy: number, masteryScore: number): MasteryRow => ({
  knowledgeNodeId: id,
  code: id.toUpperCase(),
  name: id,
  accuracy,
  masteryScore,
});

describe('rankWeakAreas', () => {
  it('keeps only low accuracy + low mastery nodes, weakest first', () => {
    const result = rankWeakAreas([
      row('strong', 0.95, 0.9), // mastered — excluded
      row('lowVolume', 0.95, 0.3), // high accuracy (untested) — excluded
      row('weak1', 0.5, 0.4),
      row('weak2', 0.3, 0.2),
    ]);
    expect(result.map((w) => w.knowledgeNodeId)).toEqual(['weak2', 'weak1']);
    expect(result[0]?.gap).toBeGreaterThan(result[1]?.gap as number);
  });

  it('respects the limit', () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`n${i}`, 0.4, 0.3));
    expect(rankWeakAreas(rows, { limit: 5 })).toHaveLength(5);
  });
});

describe('buildStudyPlan', () => {
  it('produces mixed practice when there are no weak areas', () => {
    const plan = buildStudyPlan([], { days: 3, dailyQuestions: 10 });
    expect(plan.days).toHaveLength(3);
    expect(plan.days[0]?.items[0]?.knowledgeNodeId).toBeNull();
    expect(plan.totalQuestions).toBe(30);
  });

  it('distributes weak areas across days', () => {
    const plan = buildStudyPlan(
      [
        { knowledgeNodeId: 'a', name: 'A' },
        { knowledgeNodeId: 'b', name: 'B' },
        { knowledgeNodeId: 'c', name: 'C' },
      ],
      { days: 3, dailyQuestions: 12 },
    );
    expect(plan.days).toHaveLength(3);
    const allNodes = plan.days.flatMap((d) => d.items.map((i) => i.knowledgeNodeId));
    expect(allNodes).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });
});
