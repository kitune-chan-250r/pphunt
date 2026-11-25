import { describe, expect, it } from "vitest";
import {
  DEFAULT_POPULATION_PRIOR,
  fitAccuracyCurve,
  normaliseAccuracy,
  type AccuracyObservation,
} from "./accuracyCurve";

const priorAccuracy = (stars: number): number =>
  1 -
  Math.exp(
    DEFAULT_POPULATION_PRIOR.alpha +
      DEFAULT_POPULATION_PRIOR.beta * stars +
      DEFAULT_POPULATION_PRIOR.gamma * stars ** 2,
  );

/** Deterministic synthetic observations from a known log-error curve. */
const syntheticObservations = (
  alpha: number,
  countPerStar = 3,
): AccuracyObservation[] => {
  const observations: AccuracyObservation[] = [];
  let k = 0;
  for (let stars = 5; stars <= 12; stars += 1) {
    for (let rep = 0; rep < countPerStar; rep += 1) {
      // Small deterministic jitter, no randomness.
      const jitter = ((k % 5) - 2) * 0.004;
      k += 1;
      const y =
        alpha +
        DEFAULT_POPULATION_PRIOR.beta * stars +
        DEFAULT_POPULATION_PRIOR.gamma * stars ** 2 +
        jitter;
      observations.push({ stars, accuracy: 1 - Math.exp(y) });
    }
  }
  return observations;
};

describe("normaliseAccuracy", () => {
  it("treats values above 1.5 as percents", () => {
    expect(normaliseAccuracy(96.3)).toBeCloseTo(0.963, 10);
    expect(normaliseAccuracy(95)).toBeCloseTo(0.95, 10);
  });

  it("passes fractions through and clamps to [0.01, 0.9995]", () => {
    expect(normaliseAccuracy(0.95)).toBeCloseTo(0.95, 10);
    expect(normaliseAccuracy(0)).toBe(0.01);
    expect(normaliseAccuracy(0.9999)).toBe(0.9995);
    expect(normaliseAccuracy(150)).toBe(0.9995);
  });
});

describe("fitAccuracyCurve population mode", () => {
  it("returns the prior curve with no observations", () => {
    const curve = fitAccuracyCurve([]);
    expect(curve.mode).toBe("population");
    expect(curve.sampleCount).toBe(0);
    expect(curve.predictAccuracy(4)).toBeCloseTo(priorAccuracy(4), 6);
    expect(curve.predictAccuracy(8)).toBeCloseTo(0.963, 2);
    expect(curve.maxClearedStars).toBe(0);
  });

  it("shifts alpha so predictAccuracy(8) matches averageAccuracy", () => {
    const curve = fitAccuracyCurve([], { averageAccuracy: 0.97 });
    expect(curve.predictAccuracy(8)).toBeCloseTo(0.97, 6);
    // Percent-scale average accuracy is accepted as well.
    const percentCurve = fitAccuracyCurve([], { averageAccuracy: 97 });
    expect(percentCurve.predictAccuracy(8)).toBeCloseTo(0.97, 6);
  });
});

describe("fitAccuracyCurve full mode", () => {
  it("predicts monotonically decreasing accuracy as stars rise", () => {
    const curve = fitAccuracyCurve(
      syntheticObservations(DEFAULT_POPULATION_PRIOR.alpha),
    );
    expect(curve.mode).toBe("full");
    const predictions = [6, 8, 10, 12].map((s) => curve.predictAccuracy(s));
    for (let i = 1; i < predictions.length; i += 1) {
      expect(predictions[i]).toBeLessThan(predictions[i - 1]);
    }
    // And the fit stays near the generating curve.
    expect(curve.predictAccuracy(8)).toBeCloseTo(priorAccuracy(8), 1);
    expect(curve.predictAccuracy(10)).toBeCloseTo(priorAccuracy(10), 1);
  });

  it("ignores observations with non-positive stars or invalid accuracy", () => {
    const curve = fitAccuracyCurve([
      { stars: 0, accuracy: 0.99 },
      { stars: -3, accuracy: 0.99 },
      { stars: 8, accuracy: Number.NaN },
      { stars: 8, accuracy: 0 },
    ]);
    expect(curve.mode).toBe("population");
    expect(curve.sampleCount).toBe(0);
  });
});

describe("fitAccuracyCurve intercept mode", () => {
  it("with 3 points beats the population prior for an above-average player", () => {
    const trueAlpha = -5.2;
    const observations = [8, 9, 10].map((stars) => ({
      stars,
      accuracy:
        1 -
        Math.exp(
          trueAlpha +
            DEFAULT_POPULATION_PRIOR.beta * stars +
            DEFAULT_POPULATION_PRIOR.gamma * stars ** 2,
        ),
    }));
    const curve = fitAccuracyCurve(observations);
    expect(curve.mode).toBe("intercept");
    expect(curve.beta).toBe(DEFAULT_POPULATION_PRIOR.beta);
    expect(curve.gamma).toBe(DEFAULT_POPULATION_PRIOR.gamma);

    const trueAt8 =
      1 -
      Math.exp(
        trueAlpha +
          DEFAULT_POPULATION_PRIOR.beta * 8 +
          DEFAULT_POPULATION_PRIOR.gamma * 64,
      );
    const fittedError = Math.abs(curve.predictAccuracy(8) - trueAt8);
    const priorError = Math.abs(priorAccuracy(8) - trueAt8);
    expect(fittedError).toBeLessThan(priorError);
  });
});

describe("predictAccuracyLcb", () => {
  it("is below the point estimate and more conservative at q=0.10", () => {
    const curve = fitAccuracyCurve(
      syntheticObservations(DEFAULT_POPULATION_PRIOR.alpha),
    );
    const point = curve.predictAccuracy(8);
    const lcb20 = curve.predictAccuracyLcb(8);
    const lcb10 = curve.predictAccuracyLcb(8, undefined, 0.1);
    expect(lcb20).toBeLessThan(point);
    expect(lcb10).toBeLessThan(lcb20);
  });

  it("widens (LCB drops further below the point estimate) when extrapolating", () => {
    const curve = fitAccuracyCurve(
      syntheticObservations(DEFAULT_POPULATION_PRIOR.alpha),
    );
    const gapAt8 = curve.predictAccuracy(8) - curve.predictAccuracyLcb(8);
    const gapAt14 = curve.predictAccuracy(14) - curve.predictAccuracyLcb(14);
    expect(gapAt14).toBeGreaterThan(gapAt8);
    expect(curve.predictAccuracyLcb(14)).toBeLessThan(
      curve.predictAccuracyLcb(8),
    );
  });
});

describe("clearability and maxClearedStars", () => {
  it("uses the highest stars cleared at accuracy >= 0.75", () => {
    const curve = fitAccuracyCurve([
      { stars: 9, accuracy: 0.9 },
      { stars: 10, accuracy: 0.8 },
      { stars: 11, accuracy: 0.7 },
    ]);
    expect(curve.maxClearedStars).toBe(10);
    expect(curve.clearability(10.75)).toBeCloseTo(0.5, 10);
    expect(curve.clearability(9)).toBeGreaterThan(curve.clearability(12));
    expect(curve.clearability(13)).toBeLessThan(0.05);
  });

  it("returns 0.5 up to 8 stars when nothing was cleared", () => {
    const curve = fitAccuracyCurve([]);
    expect(curve.clearability(6)).toBe(0.5);
    expect(curve.clearability(8)).toBe(0.5);
    expect(curve.clearability(12)).toBeLessThan(0.05);
  });
});

describe("characteristic offsets and low-confidence flag", () => {
  it("predicts higher accuracy for a characteristic with positive residuals", () => {
    const observations: AccuracyObservation[] = [];
    for (let stars = 6; stars <= 11; stars += 1) {
      for (let rep = 0; rep < 3; rep += 1) {
        const base =
          DEFAULT_POPULATION_PRIOR.alpha +
          DEFAULT_POPULATION_PRIOR.beta * stars +
          DEFAULT_POPULATION_PRIOR.gamma * stars ** 2;
        observations.push({
          stars,
          accuracy: 1 - Math.exp(base - 0.25),
          characteristic: "Tech",
        });
        observations.push({
          stars,
          accuracy: 1 - Math.exp(base + 0.25),
          characteristic: "Speed",
        });
      }
    }
    const curve = fitAccuracyCurve(observations);
    expect(curve.characteristicOffsets.Tech).toBeLessThan(0);
    expect(curve.predictAccuracy(9, "Tech")).toBeGreaterThan(
      curve.predictAccuracy(9, "Speed"),
    );
    expect(curve.predictAccuracy(9, "Tech")).toBeGreaterThan(
      curve.predictAccuracy(9),
    );
  });

  it("flags extrapolation beyond observed max + 1 as low confidence", () => {
    const curve = fitAccuracyCurve(
      syntheticObservations(DEFAULT_POPULATION_PRIOR.alpha),
    );
    expect(curve.maxObservedStars).toBe(12);
    expect(curve.isLowConfidence(13.5)).toBe(true);
    expect(curve.isLowConfidence(9)).toBe(false);
  });
});

describe("recency weighting", () => {
  it("downweights old observations (180-day half-life)", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const recent = fitAccuracyCurve(
      [{ stars: 8, accuracy: 0.98, createdAt: "2026-01-01T00:00:00Z" }],
      { now },
    );
    const old = fitAccuracyCurve(
      [{ stars: 8, accuracy: 0.98, createdAt: "2025-01-01T00:00:00Z" }],
      { now },
    );
    expect(recent.effectiveSampleCount).toBeCloseTo(1, 10);
    // 365 days old → weight 2^(-365/180) ≈ 0.245.
    expect(old.effectiveSampleCount).toBeCloseTo(
      Math.pow(2, -365 / 180),
      6,
    );
    // The old observation pulls the intercept less, so its prediction
    // stays closer to the population prior.
    expect(
      Math.abs(old.predictAccuracy(8) - priorAccuracy(8)),
    ).toBeLessThan(Math.abs(recent.predictAccuracy(8) - priorAccuracy(8)));
  });
});
