import { MASTERY_THRESHOLD } from '@pharmacy/contracts';
import { computeMastery } from './mastery';

describe('computeMastery', () => {
  it('returns zeros for no attempts', () => {
    expect(computeMastery({ attempts: 0, correct: 0, avgTimeMs: null })).toEqual({
      accuracy: 0,
      speedMsAvg: null,
      retention: 0,
      masteryScore: 0,
    });
  });

  it('discounts high accuracy over few attempts (low confidence)', () => {
    const result = computeMastery({ attempts: 2, correct: 2, avgTimeMs: 1000 });
    expect(result.accuracy).toBe(1);
    expect(result.masteryScore).toBeCloseTo(2 / 7); // confidence 2/(2+5)
    expect(result.masteryScore).toBeLessThan(MASTERY_THRESHOLD);
  });

  it('rewards strong, high-volume performance with mastery', () => {
    const result = computeMastery({ attempts: 100, correct: 90, avgTimeMs: 1500 });
    expect(result.accuracy).toBe(0.9);
    expect(result.masteryScore).toBeGreaterThan(MASTERY_THRESHOLD);
    expect(result.speedMsAvg).toBe(1500);
  });
});
