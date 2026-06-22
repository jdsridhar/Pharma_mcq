import { largestRemainder, splitByRatio, targetCountsFromWeights } from './blueprint-plan.util';

describe('blueprint-plan util', () => {
  describe('targetCountsFromWeights', () => {
    it('distributes a 100% blueprint to sum exactly to total', () => {
      const counts = targetCountsFromWeights([25, 25, 25, 25], 50);
      expect(counts).toEqual([13, 13, 12, 12]);
      expect(counts.reduce((s, v) => s + v, 0)).toBe(50);
    });

    it('honours uneven weights and still sums to total', () => {
      const counts = targetCountsFromWeights([50, 30, 20], 50);
      expect(counts.reduce((s, v) => s + v, 0)).toBe(50);
      expect(counts).toEqual([25, 15, 10]);
    });

    it('leaves a shortfall when weights sum to less than 100%', () => {
      // 32% of 50 ≈ 16 → the rest (34) is an intentional top-up gap.
      const counts = targetCountsFromWeights([10, 10, 2, 10], 50);
      expect(counts.reduce((s, v) => s + v, 0)).toBe(16);
    });

    it('returns zeros for all-zero weights or non-positive total', () => {
      expect(targetCountsFromWeights([0, 0], 50)).toEqual([0, 0]);
      expect(targetCountsFromWeights([50, 50], 0)).toEqual([0, 0]);
    });
  });

  describe('splitByRatio', () => {
    it('splits by EASY/MEDIUM/HARD ratio, summing to total', () => {
      const split = splitByRatio(10, [2, 2, 1]);
      expect(split).toEqual([4, 4, 2]);
      expect(split[0] + split[1] + split[2]).toBe(10);
    });

    it('treats the mix as relative weights regardless of magnitude', () => {
      expect(splitByRatio(10, [40, 40, 20])).toEqual([4, 4, 2]);
    });

    it('returns zeros for an all-zero mix', () => {
      expect(splitByRatio(10, [0, 0, 0])).toEqual([0, 0, 0]);
    });
  });

  describe('largestRemainder', () => {
    it('hands leftover units to the largest fractional parts', () => {
      // floors [1,1,1] sum 3, need 4 → the .6 gets the extra unit.
      expect(largestRemainder([1.6, 1.2, 1.2], 4)).toEqual([2, 1, 1]);
    });
  });
});
