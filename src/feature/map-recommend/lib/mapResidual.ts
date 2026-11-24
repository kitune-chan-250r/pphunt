/**
 * Per-map difficulty residual ε_m (DESIGN.md §3.1.3).
 *
 * Maps at the same star rating differ in how easy they are to score on.
 * ε_m is the median gap between other players' observed accuracy on the
 * map and their own curve predictions, shrunk by sample count and
 * clamped, and is added to the personal prediction for that map.
 */

/** One player's observed vs. curve-predicted accuracy on a map. */
export interface MapResidualSample {
  /** Accuracy the player actually achieved (fraction, 0–1). */
  observedAccuracy: number;
  /** Accuracy that player's own curve predicted for the map. */
  predictedAccuracy: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Compute ε_m from leaderboard samples (DESIGN.md §3.1.3).
 *
 * Returns 0 with fewer than 3 samples. Otherwise returns the median of
 * `(observed − predicted)`, shrunk by `n/(n+6)` and clamped to
 * [−0.012, 0.012].
 */
export const computeMapResidual = (samples: MapResidualSample[]): number => {
  const diffs = samples
    .filter(
      (s) =>
        s &&
        Number.isFinite(s.observedAccuracy) &&
        Number.isFinite(s.predictedAccuracy),
    )
    .map((s) => s.observedAccuracy - s.predictedAccuracy);
  if (diffs.length < 3) return 0;
  const shrunk = median(diffs) * (diffs.length / (diffs.length + 6));
  return clamp(shrunk, -0.012, 0.012);
};
