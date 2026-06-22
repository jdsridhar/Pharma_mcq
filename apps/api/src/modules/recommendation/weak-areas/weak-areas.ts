import { MASTERY_THRESHOLD, type WeakAreaDto } from '@pharmacy/contracts';

/**
 * Pure weak-area detection. A node is "weak" when both its mastery and its raw accuracy are
 * below threshold (using accuracy avoids flagging high-accuracy-but-low-volume nodes, whose
 * mastery is low only due to the confidence factor). Ranked weakest-first by mastery gap.
 */
export interface MasteryRow {
  knowledgeNodeId: string;
  code: string;
  name: string;
  accuracy: number;
  masteryScore: number;
}

export interface WeakAreaOptions {
  masteryThreshold?: number;
  accuracyThreshold?: number;
  limit?: number;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function rankWeakAreas(rows: MasteryRow[], opts: WeakAreaOptions = {}): WeakAreaDto[] {
  const masteryThreshold = opts.masteryThreshold ?? MASTERY_THRESHOLD;
  const accuracyThreshold = opts.accuracyThreshold ?? 0.7;
  const limit = opts.limit ?? 10;

  return rows
    .filter((r) => r.masteryScore < masteryThreshold && r.accuracy < accuracyThreshold)
    .map((r) => ({
      knowledgeNodeId: r.knowledgeNodeId,
      code: r.code,
      name: r.name,
      accuracy: r.accuracy,
      masteryScore: r.masteryScore,
      gap: round(masteryThreshold - r.masteryScore),
    }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);
}
