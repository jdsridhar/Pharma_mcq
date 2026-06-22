import type { StudyPlanDayDto, StudyPlanDto } from '@pharmacy/contracts';

/**
 * Pure study planner. Distributes weak areas round-robin across the requested days and
 * splits the daily question budget among that day's nodes. Days with no weak area fall back
 * to mixed practice. No weak areas at all ⇒ every day is mixed practice.
 */
export interface PlannerNode {
  knowledgeNodeId: string;
  name: string;
}

export function buildStudyPlan(
  weakAreas: PlannerNode[],
  opts: { days: number; dailyQuestions: number },
): StudyPlanDto {
  const days: StudyPlanDayDto[] = [];

  for (let d = 0; d < opts.days; d += 1) {
    const dayNodes = weakAreas.filter((_, index) => index % opts.days === d);
    if (dayNodes.length === 0) {
      days.push({
        day: d + 1,
        items: [{ knowledgeNodeId: null, name: 'Mixed practice', questions: opts.dailyQuestions }],
      });
    } else {
      const per = Math.max(1, Math.floor(opts.dailyQuestions / dayNodes.length));
      days.push({
        day: d + 1,
        items: dayNodes.map((n) => ({ knowledgeNodeId: n.knowledgeNodeId, name: n.name, questions: per })),
      });
    }
  }

  const totalQuestions = days.reduce(
    (sum, day) => sum + day.items.reduce((acc, item) => acc + item.questions, 0),
    0,
  );
  return { days, totalQuestions };
}
