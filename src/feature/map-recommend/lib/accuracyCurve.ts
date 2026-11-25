/**
 * Personal accuracy curve estimation (DESIGN.md §3.1.1).
 *
 * The curve is fitted in log-error space: with `y = ln(1 - accuracy)` the
 * model is `ŷ(s) = α + β·s + γ·s²` and `â(s) = 1 - exp(ŷ(s))`.
 * Fitting in log-error space matters because PP is almost flat near 85%
 * accuracy and explodes above 97%, so equal absolute accuracy errors have
 * wildly different PP consequences (DESIGN.md §3.1.1).
 */

/** One observed best score used to fit the accuracy curve. */
export interface AccuracyObservation {
  /** Star rating of the map; observations with `stars <= 0` are ignored. */
  stars: number;
  /** Raw API accuracy: a fraction (0–1) or a percent (> 1.5). */
  accuracy: number;
  /** ScoreSaber characteristic (e.g. "SoloStandard"), if known. */
  characteristic?: string;
  /** When the score was set; used for the recency weight. */
  createdAt?: string | number | Date;
}

/** Population prior parameters for `ŷ = α + β·s + γ·s²`. */
export interface AccuracyCurvePrior {
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * Default population prior (DESIGN.md §3.1.1 fallback / shrinkage target).
 *
 * Derived from the band medians measured in DESIGN.md §2.2
 * (4★ ≈ 0.982, 8★ ≈ 0.963, 10★ ≈ 0.945, 11★ ≈ 0.927, 12★ ≈ 0.900):
 * the curve predicts ≈0.982 at 4★, ≈0.963 at 8★ and ≈0.941 at 10★.
 */
export const DEFAULT_POPULATION_PRIOR: AccuracyCurvePrior = {
  alpha: -4.46,
  beta: 0.077,
  gamma: 0.0086,
};

/** Options accepted by {@link fitAccuracyCurve}. */
export interface FitAccuracyCurveOptions {
  /** Population prior to shrink toward; defaults to {@link DEFAULT_POPULATION_PRIOR}. */
  prior?: AccuracyCurvePrior;
  /** Reference time for recency weights; defaults to `Date.now()`. */
  now?: number | Date;
  /**
   * Profile average accuracy (raw API value, may be on the percent scale).
   * Only used in population mode (0 observations) to shift α so that
   * `predictAccuracy(8)` matches it.
   */
  averageAccuracy?: number;
}

/** A fitted personal accuracy curve (DESIGN.md §3.1.1, §3.1.5). */
export interface AccuracyCurve {
  /** Which fallback stage produced this curve. */
  mode: "full" | "intercept" | "population";
  alpha: number;
  beta: number;
  gamma: number;
  /** Number of valid observations used. */
  sampleCount: number;
  /** Sum of recency weights of the valid observations. */
  effectiveSampleCount: number;
  /** Highest stars cleared at accuracy >= 0.75 (0 when none). */
  maxClearedStars: number;
  /** Highest stars among the valid observations (0 when none). */
  maxObservedStars: number;
  /** Weighted residual variance in log-error (y) space, after flooring. */
  residualVariance: number;
  /** Per-characteristic offsets in y space, after shrinkage. */
  characteristicOffsets: Readonly<Record<string, number>>;
  /** Predicted accuracy at `stars`, clamped to [0.30, 0.999]. */
  predictAccuracy: (stars: number, characteristic?: string) => number;
  /**
   * Lower confidence bound on accuracy (DESIGN.md §3.1.5): the accuracy
   * that is exceeded with probability `1 - quantile`. Defaults to the
   * one-sided 80% bound (quantile 0.20).
   */
  predictAccuracyLcb: (
    stars: number,
    characteristic?: string,
    quantile?: number,
  ) => number;
  /** Predictive variance of `ŷ(stars)` in log-error space. */
  predictLogErrorVariance: (stars: number) => number;
  /** Clearability gate from DESIGN.md §3.1.5, in [0, 1]. */
  clearability: (stars: number) => number;
  /**
   * True when the parametric curve disagrees with the isotonic check by
   * more than 1.5 accuracy points, or when `stars` extrapolates more
   * than 1★ beyond the observed maximum (DESIGN.md §3.1.1).
   */
  isLowConfidence: (stars: number) => boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Normalise a raw API accuracy to a fraction in [0.01, 0.9995].
 *
 * Values above 1.5 are treated as percents (e.g. 96.3 → 0.963), matching
 * the mixed scales seen from ScoreSaber-derived sources.
 */
export const normaliseAccuracy = (accuracy: number): number => {
  if (!Number.isFinite(accuracy)) return 0.01;
  const fraction = accuracy > 1.5 ? accuracy / 100 : accuracy;
  return clamp(fraction, 0.01, 0.9995);
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Solve a small dense linear system by Gaussian elimination with pivoting. */
const solveLinearSystem = (
  matrix: number[][],
  rhs: number[],
): number[] | null => {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = a[row][n];
    for (let k = row + 1; k < n; k += 1) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
};

/** Invert a small dense matrix by Gauss–Jordan elimination with pivoting. */
const invertMatrix = (matrix: number[][]): number[][] | null => {
  const n = matrix.length;
  const a = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) {
      const tmp = a[pivot];
      a[pivot] = a[col];
      a[col] = tmp;
    }
    const divisor = a[col][col];
    for (let k = 0; k < 2 * n; k += 1) a[col][k] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let k = 0; k < 2 * n; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row) => row.slice(n));
};

/**
 * z value for a lower accuracy bound at the given quantile:
 * `z = -Φ⁻¹(quantile)`, so q = 0.20 → 0.8416, q = 0.10 → 1.2816 and
 * q = 0.35 → 0.3853. Uses the Acklam rational approximation of the
 * inverse normal CDF, which reproduces those anchors to ~1e-4.
 */
const zForQuantile = (quantile: number): number => {
  const q = clamp(quantile, 0.001, 0.999);
  // Acklam's approximation of Φ⁻¹(q).
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  let x: number;
  if (q < pLow) {
    const r = Math.sqrt(-2 * Math.log(q));
    x =
      (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  } else if (q <= 1 - pLow) {
    const r = q - 0.5;
    const s = r * r;
    x =
      ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) *
        r) /
      (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
  } else {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    x =
      -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  return -x;
};

interface PreparedObservation {
  stars: number;
  accuracy: number;
  y: number;
  weight: number;
  characteristic?: string;
}

/**
 * Pool-adjacent-violators isotonic fit (non-increasing) over 0.5★ bins of
 * observed accuracy medians (DESIGN.md §3.1.1 non-parametric check).
 * Returns a lookup from bin start to the isotonic accuracy, or null when
 * there are no observations.
 */
const buildIsotonicLookup = (
  prepared: PreparedObservation[],
): Map<number, number> | null => {
  if (prepared.length === 0) return null;
  const bins = new Map<number, number[]>();
  for (const obs of prepared) {
    const bin = Math.floor(obs.stars * 2) / 2;
    const list = bins.get(bin) ?? [];
    list.push(obs.accuracy);
    bins.set(bin, list);
  }
  const keys = [...bins.keys()].sort((a, b) => a - b);
  // Blocks of { value (weighted mean of medians), weight (count), keys }.
  const blocks: { value: number; weight: number; keys: number[] }[] = [];
  for (const key of keys) {
    const values = bins.get(key) ?? [];
    blocks.push({ value: median(values), weight: values.length, keys: [key] });
    while (
      blocks.length >= 2 &&
      blocks[blocks.length - 2].value < blocks[blocks.length - 1].value
    ) {
      const last = blocks.pop() as { value: number; weight: number; keys: number[] };
      const prev = blocks.pop() as { value: number; weight: number; keys: number[] };
      const weight = prev.weight + last.weight;
      blocks.push({
        value: (prev.value * prev.weight + last.value * last.weight) / weight,
        weight,
        keys: [...prev.keys, ...last.keys],
      });
    }
  }
  const lookup = new Map<number, number>();
  for (const block of blocks) {
    for (const key of block.keys) lookup.set(key, block.value);
  }
  return lookup;
};

/**
 * Fit a personal accuracy curve from observed best scores.
 *
 * Fallback stages (DESIGN.md §3.1.1):
 * - `full` (effective observations >= 8): weighted ridge regression toward
 *   the prior with Huber IRLS robustness.
 * - `intercept` (1–7 observations): β and γ fixed at the prior, only α is
 *   estimated, shrunk toward the prior α.
 * - `population` (0 observations): the prior curve itself, optionally
 *   shifted so `predictAccuracy(8)` matches `averageAccuracy`.
 */
export const fitAccuracyCurve = (
  observations: AccuracyObservation[],
  options: FitAccuracyCurveOptions = {},
): AccuracyCurve => {
  const prior = options.prior ?? DEFAULT_POPULATION_PRIOR;
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : (options.now ?? Date.now());

  const prepared: PreparedObservation[] = [];
  for (const obs of observations) {
    if (!obs || !Number.isFinite(obs.stars) || obs.stars <= 0) continue;
    if (!Number.isFinite(obs.accuracy)) continue;
    const accuracy = normaliseAccuracy(obs.accuracy);
    // normaliseAccuracy clamps, so reject clearly invalid raw values first:
    // a raw fraction must be in (0, 1] and a raw percent in (0, 100].
    if (obs.accuracy <= 0 || obs.accuracy > 100) continue;
    let weight = 1;
    if (obs.createdAt !== undefined && obs.createdAt !== null) {
      const t =
        obs.createdAt instanceof Date
          ? obs.createdAt.getTime()
          : typeof obs.createdAt === "number"
            ? obs.createdAt
            : Date.parse(obs.createdAt);
      if (Number.isFinite(t)) {
        const ageDays = Math.max(0, (nowMs - t) / 86_400_000);
        // Recency weight with a 180-day half-life (DESIGN.md §3.1.1).
        weight = Math.pow(2, -ageDays / 180);
      }
    }
    prepared.push({
      stars: obs.stars,
      accuracy,
      y: Math.log(1 - accuracy),
      weight,
      characteristic: obs.characteristic,
    });
  }

  const sampleCount = prepared.length;
  const effectiveSampleCount = prepared.reduce((sum, o) => sum + o.weight, 0);
  const maxObservedStars = prepared.reduce(
    (max, o) => Math.max(max, o.stars),
    0,
  );
  const maxClearedStars = prepared.reduce(
    (max, o) => (o.accuracy >= 0.75 ? Math.max(max, o.stars) : max),
    0,
  );
  const weightedMeanStars =
    effectiveSampleCount > 0
      ? prepared.reduce((sum, o) => sum + o.weight * o.stars, 0) /
        effectiveSampleCount
      : 0;

  let mode: AccuracyCurve["mode"];
  let alpha = prior.alpha;
  let beta = prior.beta;
  let gamma = prior.gamma;
  // (XᵀWX + Λ)⁻¹ for the full mode; null in the fallback modes.
  let designInverse: number[][] | null = null;

  if (sampleCount === 0) {
    mode = "population";
    if (
      options.averageAccuracy !== undefined &&
      Number.isFinite(options.averageAccuracy)
    ) {
      const target = normaliseAccuracy(options.averageAccuracy);
      const yTarget = Math.log(1 - target);
      // Shift α so the curve passes through averageAccuracy at 8★.
      alpha = yTarget - prior.beta * 8 - prior.gamma * 64;
    }
  } else if (effectiveSampleCount < 8) {
    mode = "intercept";
    beta = prior.beta;
    gamma = prior.gamma;
    const weightedMeanOffset =
      prepared.reduce(
        (sum, o) => sum + o.weight * (o.y - beta * o.stars - gamma * o.stars ** 2),
        0,
      ) / effectiveSampleCount;
    // Shrink the data-only intercept toward the prior α (DESIGN.md §3.1.1).
    const mix = effectiveSampleCount / (effectiveSampleCount + 15);
    alpha = mix * weightedMeanOffset + (1 - mix) * prior.alpha;
  } else {
    mode = "full";
    // Ridge toward the prior with a prior precision equivalent to ~15
    // pseudo-observations. λ_j = 15 · E[x_j²] keeps the shrinkage on a
    // common scale across the very differently scaled columns
    // (1, s, s²); γ is shrunk three times more strongly, as DESIGN.md
    // §3.1.1 requires γ to be pulled hard toward the population value.
    const meanS2 =
      prepared.reduce((sum, o) => sum + o.weight * o.stars ** 2, 0) /
      effectiveSampleCount;
    const meanS4 =
      prepared.reduce((sum, o) => sum + o.weight * o.stars ** 4, 0) /
      effectiveSampleCount;
    const lambda = [15 * 1, 15 * meanS2, 45 * meanS4];
    const priorTheta = [prior.alpha, prior.beta, prior.gamma];

    const solveRidge = (weights: number[]): number[] | null => {
      const xtwx = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      const xtwy = [0, 0, 0];
      prepared.forEach((o, i) => {
        const x = [1, o.stars, o.stars ** 2];
        for (let r = 0; r < 3; r += 1) {
          for (let c = 0; c < 3; c += 1) {
            xtwx[r][c] += weights[i] * x[r] * x[c];
          }
          xtwy[r] += weights[i] * x[r] * o.y;
        }
      });
      const regularised = xtwx.map((row, r) =>
        row.map((value, c) => value + (r === c ? lambda[r] : 0)),
      );
      const rhs = xtwy.map(
        (value, r) => value + lambda[r] * priorTheta[r],
      );
      designInverse = invertMatrix(regularised);
      return solveLinearSystem(regularised, rhs);
    };

    let weights = prepared.map((o) => o.weight);
    let theta = solveRidge(weights);
    // Huber IRLS (δ = 1.345 on robustly standardised residuals, ~5 rounds).
    if (theta) {
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const current = theta;
        const residuals = prepared.map(
          (o) => o.y - (current[0] + current[1] * o.stars + current[2] * o.stars ** 2),
        );
        const centre = median(residuals);
        const mad = median(residuals.map((r) => Math.abs(r - centre)));
        const scale = Math.max(1.4826 * mad, 0.05);
        const threshold = 1.345 * scale;
        weights = prepared.map((o, i) => {
          const abs = Math.abs(residuals[i]);
          const huber = abs <= threshold ? 1 : threshold / abs;
          return o.weight * huber;
        });
        const next = solveRidge(weights);
        if (!next) break;
        theta = next;
      }
    }
    if (theta) {
      [alpha, beta, gamma] = theta;
    } else {
      // Degenerate design (e.g. all observations at one star level):
      // fall back to the intercept stage rather than failing.
      mode = "intercept";
      beta = prior.beta;
      gamma = prior.gamma;
      const weightedMeanOffset =
        prepared.reduce(
          (sum, o) =>
            sum + o.weight * (o.y - beta * o.stars - gamma * o.stars ** 2),
          0,
        ) / effectiveSampleCount;
      const mix = effectiveSampleCount / (effectiveSampleCount + 15);
      alpha = mix * weightedMeanOffset + (1 - mix) * prior.alpha;
    }
  }

  const predictY = (stars: number, characteristic?: string): number => {
    let y = alpha + beta * stars + gamma * stars ** 2;
    if (characteristic !== undefined) {
      y += characteristicOffsets[characteristic] ?? 0;
    }
    return y;
  };

  // Characteristic offsets: per-characteristic mean residual in y space
  // after the main fit, shrunk by n/(n+8) (DESIGN.md §3.1.1).
  const characteristicOffsets: Record<string, number> = {};
  if (sampleCount > 0) {
    const groups = new Map<string, { weightedResidual: number; weight: number }>();
    for (const o of prepared) {
      if (o.characteristic === undefined) continue;
      const group = groups.get(o.characteristic) ?? {
        weightedResidual: 0,
        weight: 0,
      };
      group.weightedResidual +=
        o.weight * (o.y - (alpha + beta * o.stars + gamma * o.stars ** 2));
      group.weight += o.weight;
      groups.set(o.characteristic, group);
    }
    for (const [key, group] of groups) {
      if (group.weight <= 0) continue;
      const mean = group.weightedResidual / group.weight;
      characteristicOffsets[key] = mean * (group.weight / (group.weight + 8));
    }
  }

  // Residual variance in y space (weighted), floored conservatively.
  let residualVariance: number;
  if (sampleCount === 0) {
    residualVariance = 0.15 ** 2;
  } else {
    const weightedSq =
      prepared.reduce((sum, o) => {
        const residual = o.y - predictY(o.stars, o.characteristic);
        return sum + o.weight * residual ** 2;
      }, 0) / effectiveSampleCount;
    residualVariance = weightedSq;
    const floor = sampleCount < 8 ? 0.08 ** 2 : 0.02 ** 2;
    residualVariance = Math.max(residualVariance, floor, 0.02 ** 2);
  }

  const isotonicLookup = buildIsotonicLookup(prepared);

  const predictLogErrorVariance = (stars: number): number => {
    if (mode === "full" && designInverse) {
      const x = [1, stars, stars ** 2];
      let leverage = 0;
      for (let r = 0; r < 3; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          leverage += x[r] * designInverse[r][c] * x[c];
        }
      }
      return residualVariance * (1 + Math.max(0, leverage));
    }
    if (mode === "intercept") {
      // Approximation: the exact (XᵀWX + Λ)⁻¹ leverage of the one-parameter
      // fit is replaced by a quadratic growth around the observed mean
      // star level, i.e. Var ≈ σ² · (1 + ((s − s̄)/4)²).
      return residualVariance * (1 + ((stars - weightedMeanStars) / 4) ** 2);
    }
    // Population mode approximation: no personal data, so the variance
    // grows quadratically with the star level itself,
    // Var ≈ σ² · (1 + (s/4)²).
    return residualVariance * (1 + (stars / 4) ** 2);
  };

  const predictAccuracy = (stars: number, characteristic?: string): number =>
    clamp(1 - Math.exp(predictY(stars, characteristic)), 0.3, 0.999);

  const predictAccuracyLcb = (
    stars: number,
    characteristic?: string,
    quantile = 0.2,
  ): number => {
    const z = zForQuantile(quantile);
    const y = predictY(stars, characteristic);
    const sd = Math.sqrt(Math.max(0, predictLogErrorVariance(stars)));
    // y is log-error, so the *lower* accuracy bound adds z·sd to y.
    const lcb = clamp(1 - Math.exp(y + z * sd), 0.3, 0.999);
    return Math.min(lcb, predictAccuracy(stars, characteristic));
  };

  const clearability = (stars: number): number => {
    if (maxClearedStars === 0) {
      // No clear observed at all: neutral 0.5 up to 8★, then a fast
      // exponential decay (halving per extra star) as a documented
      // conservative choice for the "small" region.
      if (stars <= 8) return 0.5;
      return 0.5 * Math.pow(2, -(stars - 8));
    }
    // Logistic gate centred 0.75★ above the best cleared level
    // (DESIGN.md §3.1.5).
    return 1 / (1 + Math.exp((stars - (maxClearedStars + 0.75)) / 0.5));
  };

  const isLowConfidence = (stars: number): boolean => {
    if (stars > maxObservedStars + 1) return true;
    if (sampleCount < 8 || !isotonicLookup) return false;
    const bin = Math.floor(stars * 2) / 2;
    let isotonicValue = isotonicLookup.get(bin);
    if (isotonicValue === undefined) {
      // Use the nearest available bin at or below the requested level,
      // falling back to the lowest bin.
      const keys = [...isotonicLookup.keys()].sort((a, b) => a - b);
      const below = keys.filter((k) => k <= bin);
      const key = below.length > 0 ? below[below.length - 1] : keys[0];
      isotonicValue = isotonicLookup.get(key);
    }
    if (isotonicValue === undefined) return false;
    return Math.abs(predictAccuracy(stars) - isotonicValue) > 0.015;
  };

  return {
    mode,
    alpha,
    beta,
    gamma,
    sampleCount,
    effectiveSampleCount,
    maxClearedStars,
    maxObservedStars,
    residualVariance,
    characteristicOffsets,
    predictAccuracy,
    predictAccuracyLcb,
    predictLogErrorVariance,
    clearability,
    isLowConfidence,
  };
};
