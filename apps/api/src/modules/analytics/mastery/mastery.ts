/**
 * Pure mastery computation. Mastery blends accuracy with a volume-confidence factor, so a
 * high accuracy over very few attempts does not over-state mastery. No DB — unit-testable.
 *
 *   confidence = attempts / (attempts + K)      // saturating, K = 5
 *   masteryScore = accuracy * confidence        // in [0, 1]
 */
export interface MasteryStats {
  attempts: number;
  correct: number;
  avgTimeMs: number | null;
}

export interface MasteryComputation {
  accuracy: number;
  speedMsAvg: number | null;
  retention: number;
  masteryScore: number;
}

const CONFIDENCE_K = 5;

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function computeMastery(stats: MasteryStats): MasteryComputation {
  const accuracy = stats.attempts > 0 ? stats.correct / stats.attempts : 0;
  const confidence = stats.attempts > 0 ? stats.attempts / (stats.attempts + CONFIDENCE_K) : 0;
  const masteryScore = accuracy * confidence;
  return {
    accuracy: round(accuracy),
    speedMsAvg: stats.avgTimeMs,
    // Retention proxy = accuracy until a spaced-repetition decay model is wired (Phase 13+).
    retention: round(accuracy),
    masteryScore: round(masteryScore),
  };
}
