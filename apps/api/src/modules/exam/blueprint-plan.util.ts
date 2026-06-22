/**
 * Pure math for **weight-driven** exam blueprints.
 *
 * A blueprint declares a `totalQuestions` target and a set of items, each carrying a `weightPercent`
 * (the item's share of the paper) and an optional `difficultyMix` (EASY/MEDIUM/HARD split). The
 * author never types per-item question counts — they are *derived* here so they always reconcile
 * with the total and the weights. Counts are produced with the **largest-remainder method** so the
 * derived integers sum exactly to the intended subtotal (no drift from naive rounding).
 */

/**
 * Distribute `total` across items by `weightPercent`, where weights are literal percentages of the
 * paper (so a blueprint whose weights sum to < 100% intentionally leaves a remainder to be topped
 * up). Returns integer counts that sum to `round(Σweight/100 × total)`.
 *
 *  - `weights` summing to 100 → counts sum to `total`.
 *  - `weights` summing to 60  → counts sum to ~`0.6 × total` (the rest is a top-up shortfall).
 *  - all-zero weights         → all zeros.
 */
export function targetCountsFromWeights(weights: number[], total: number): number[] {
  if (weights.length === 0 || total <= 0) {
    return weights.map(() => 0);
  }
  const ideal = weights.map((w) => (Math.max(0, w) / 100) * total);
  const targetSum = Math.round(ideal.reduce((s, v) => s + v, 0));
  return largestRemainder(ideal, targetSum);
}

/**
 * Split `total` into three buckets by the EASY/MEDIUM/HARD ratio. The mix values are treated as
 * *relative weights*, not absolute counts, so they remain valid however `total` is derived. Returns
 * `[easy, medium, hard]` summing exactly to `total`; an all-zero mix yields `[0, 0, 0]`.
 */
export function splitByRatio(total: number, ratio: [number, number, number]): [number, number, number] {
  const sum = ratio.reduce((s, v) => s + Math.max(0, v), 0);
  if (sum <= 0 || total <= 0) {
    return [0, 0, 0];
  }
  const ideal = ratio.map((r) => (Math.max(0, r) / sum) * total);
  const [e, m, h] = largestRemainder(ideal, total);
  return [e ?? 0, m ?? 0, h ?? 0];
}

/**
 * Largest-remainder rounding: floor every ideal, then hand the leftover units (so the result sums
 * to `targetSum`) to the entries with the biggest fractional parts. Deterministic; ties break by
 * lower index. Caps each entry's growth so it never exceeds `ceil(ideal)` and never goes negative.
 */
export function largestRemainder(ideal: number[], targetSum: number): number[] {
  const floors = ideal.map((v) => Math.floor(Math.max(0, v)));
  let remaining = targetSum - floors.reduce((s, v) => s + v, 0);
  const order = ideal
    .map((v, i) => ({ i, frac: Math.max(0, v) - Math.floor(Math.max(0, v)) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const result = [...floors];
  for (const { i } of order) {
    if (remaining <= 0) {
      break;
    }
    result[i] = (result[i] ?? 0) + 1;
    remaining -= 1;
  }
  return result;
}
