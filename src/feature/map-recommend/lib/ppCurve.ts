/**
 * PP curve self-calibration (DESIGN.md §3.1.2).
 *
 * Raw PP is modelled as `PP = stars · C(accuracy)`. The anchor curve is
 * the community fit (`C(0.95) = 42.11`, rising steeply above 95%), and
 * {@link fitPpCurve} rescales it from real `(accuracy, pp, stars)`
 * samples so the model follows ScoreSaber rebalances instead of a
 * hard-coded constant.
 */
import { normaliseAccuracy } from "./accuracyCurve";

/** One real score used to calibrate the PP curve. */
export interface PpCurveSample {
  /** Raw API accuracy: a fraction (0–1) or a percent (> 1.5). */
  accuracy: number;
  /** Raw (unweighted) PP of the score. */
  pp: number;
  /** Star rating of the map. */
  stars: number;
}

/** A calibrated PP curve (DESIGN.md §3.1.2). */
export interface PpCurve {
  /** Predicted raw PP for a map of `stars` played at `accuracy`. */
  predictPp: (stars: number, accuracy: number) => number;
  /** Calibrated curve value `C(accuracy)` (PP per star). */
  curveValue: (accuracy: number) => number;
  /** Multiplicative rescale fitted from the samples (1 when none). */
  scale: number;
  /** Number of samples that passed the validity filters. */
  sampleCount: number;
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
 * Community anchor curve `C(a) = 42.11 · ((1/(1−a)) / 20)^0.545`
 * (DESIGN.md §3.1.2). By construction `C(0.95) = 42.11`; at 0.99 the
 * formula gives ≈2.40× that value (the design document quotes ≈2.33×
 * from the measured band medians). The input is clamped to
 * [0.5, 0.999] so the curve stays finite and monotone.
 */
export const anchorCurveValue = (accuracy: number): number => {
  const a = clamp(
    Number.isFinite(accuracy) ? accuracy : 0.5,
    0.5,
    0.999,
  );
  return 42.11 * Math.pow(1 / (1 - a) / 20, 0.545);
};

/**
 * Fit the PP curve scale from real samples (DESIGN.md §3.1.2).
 *
 * Only samples with `stars > 0`, `pp > 0` and normalised accuracy in
 * [0.80, 0.999] are used. For each sample the ratio
 * `(pp / stars) / anchorCurveValue(accuracy)` is taken; the scale is
 * the median ratio shrunk toward 1 with 10 pseudo-samples,
 * `scale = (n·median + 10·1) / (n + 10)`, clamped to [0.4, 2.5].
 * With no usable samples the scale is exactly 1 (pure anchor curve).
 */
export const fitPpCurve = (samples: PpCurveSample[]): PpCurve => {
  const ratios: number[] = [];
  for (const sample of samples) {
    if (!sample) continue;
    if (!Number.isFinite(sample.stars) || sample.stars <= 0) continue;
    if (!Number.isFinite(sample.pp) || sample.pp <= 0) continue;
    if (!Number.isFinite(sample.accuracy)) continue;
    const accuracy = normaliseAccuracy(sample.accuracy);
    if (accuracy < 0.8 || accuracy > 0.999) continue;
    ratios.push(sample.pp / sample.stars / anchorCurveValue(accuracy));
  }
  const n = ratios.length;
  const scale =
    n === 0
      ? 1
      : clamp((n * median(ratios) + 10 * 1) / (n + 10), 0.4, 2.5);

  const curveValue = (accuracy: number): number =>
    anchorCurveValue(accuracy) * scale;
  const predictPp = (stars: number, accuracy: number): number =>
    stars * curveValue(accuracy);

  return { predictPp, curveValue, scale, sampleCount: n };
};
