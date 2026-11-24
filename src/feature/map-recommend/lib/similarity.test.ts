import { describe, expect, it } from "vitest";
import {
  computeMapMedianAccuracies,
  computeSimilarity,
  transportAccuracy,
  type PlayerScoreSummary,
} from "./similarity";

const score = (
  leaderboardId: number,
  accuracy: number,
  characteristic = "SoloStandard",
): PlayerScoreSummary => ({
  leaderboardId,
  accuracy,
  pp: 400,
  stars: 10,
  characteristic,
});

/** Accuracies with a strong per-map pattern (some maps suit the player). */
const PATTERN = [0.98, 0.9, 0.96, 0.88, 0.97, 0.91, 0.95, 0.89, 0.99, 0.92];

const patternedPlayer = (offset: number): PlayerScoreSummary[] =>
  PATTERN.map((a, i) => score(i + 1, a + offset));

describe("computeMapMedianAccuracies", () => {
  it("takes the median normalised accuracy per map over players who have it", () => {
    const medians = computeMapMedianAccuracies([
      [score(1, 0.9), score(2, 0.95)],
      [score(1, 96), score(3, 0.8)],
      [score(1, 0.99)],
    ]);
    expect(medians.get(1)).toBeCloseTo(0.96, 10);
    expect(medians.get(2)).toBeCloseTo(0.95, 10);
    expect(medians.get(3)).toBeCloseTo(0.8, 10);
    expect(medians.has(4)).toBe(false);
  });
});

describe("computeSimilarity", () => {
  it("scores identical playstyles high", () => {
    const target = patternedPlayer(0);
    const twin = patternedPlayer(0);
    // Flat extra players in the median pool keep the per-map medians
    // from collapsing onto the twins' own accuracies, so the relative
    // accuracies vary per map and Pearson is defined.
    const flat = (accuracy: number): PlayerScoreSummary[] =>
      PATTERN.map((_, i) => score(i + 1, accuracy));
    const medians = computeMapMedianAccuracies([
      target,
      twin,
      flat(0.93),
      flat(0.94),
    ]);
    const result = computeSimilarity(target, twin, medians);
    expect(result.sharedCount).toBe(10);
    expect(result.pearson).toBeCloseTo(1, 6);
    expect(result.relAccCosine).toBeCloseTo(1, 6);
    expect(result.characteristicCosine).toBeCloseTo(1, 10);
    expect(result.jaccard).toBeCloseTo(1, 10);
    // 0.55·(1·10/20) + 0.20 + 0.15 + 0.10 = 0.725.
    expect(result.similarity).toBeCloseTo(0.725, 6);
  });

  it("scores disjoint players at ~0", () => {
    const target = PATTERN.map((a, i) => score(i + 1, a, "Tech"));
    const other = PATTERN.map((a, i) => score(i + 101, a, "Speed"));
    const medians = computeMapMedianAccuracies([target, other]);
    const result = computeSimilarity(target, other, medians);
    expect(result.sharedCount).toBe(0);
    expect(result.jaccard).toBe(0);
    expect(result.characteristicCosine).toBe(0);
    expect(result.similarity).toBe(0);
  });

  it("applies the evidence gate: shared < 5 and characteristic cosine < 0.7 → 0", () => {
    const target = [
      score(1, 0.95, "Tech"),
      score(2, 0.94, "Tech"),
      score(3, 0.93, "Tech"),
      score(4, 0.92, "Tech"),
      score(5, 0.91, "Tech"),
    ];
    const other = [
      score(1, 0.95, "Speed"),
      score(2, 0.94, "Speed"),
      score(3, 0.93, "Speed"),
      score(6, 0.92, "Speed"),
      score(7, 0.91, "Speed"),
    ];
    const medians = computeMapMedianAccuracies([target, other]);
    const result = computeSimilarity(target, other, medians);
    expect(result.sharedCount).toBe(3);
    expect(result.characteristicCosine).toBeLessThan(0.7);
    expect(result.similarity).toBe(0);
  });

  it("keeps a positive similarity with shared < 5 when characteristics align", () => {
    const target = [score(1, 0.95), score(2, 0.9), score(3, 0.97)];
    const other = [score(1, 0.95), score(2, 0.9), score(3, 0.97)];
    const medians = computeMapMedianAccuracies([target, other]);
    const result = computeSimilarity(target, other, medians);
    expect(result.sharedCount).toBe(3);
    expect(result.characteristicCosine).toBeCloseTo(1, 10);
    // Pearson component is zeroed for shared < 5, but the relative
    // accuracy cosine, characteristic cosine and Jaccard still count.
    expect(result.similarity).toBeGreaterThan(0.3);
  });

  it("shrinks Pearson by sharedCount / (sharedCount + 10)", () => {
    const target = patternedPlayer(0);
    const twin = patternedPlayer(0);
    const flat = (accuracy: number): PlayerScoreSummary[] =>
      PATTERN.map((_, i) => score(i + 1, accuracy));
    const medians = computeMapMedianAccuracies([
      target,
      twin,
      flat(0.93),
      flat(0.94),
    ]);
    const result = computeSimilarity(target, twin, medians);
    expect(result.pearsonShrunk).toBeCloseTo(result.pearson * (10 / 20), 10);
  });
});

describe("transportAccuracy", () => {
  it("returns null for no samples", () => {
    expect(transportAccuracy([], 0.95)).toBeNull();
  });

  it("shifts the neighbour accuracy by the curve difference", () => {
    const transported = transportAccuracy(
      [{ neighbourAccuracy: 0.95, neighbourPredicted: 0.93, similarity: 1 }],
      0.9,
    );
    // 0.95 + (0.90 − 0.93) = 0.92.
    expect(transported).toBeCloseTo(0.92, 10);
  });

  it("takes the similarity-weighted median", () => {
    const transported = transportAccuracy(
      [
        { neighbourAccuracy: 0.9, neighbourPredicted: 0.9, similarity: 3 },
        { neighbourAccuracy: 0.98, neighbourPredicted: 0.9, similarity: 1 },
      ],
      0.9,
    );
    // Values 0.90 (weight 3) and 0.98 (weight 1): half the total weight
    // (2) is already reached at 0.90.
    expect(transported).toBeCloseTo(0.9, 10);
  });
});
