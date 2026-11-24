import { describe, expect, it } from "vitest";
import { computeMapResidual } from "./mapResidual";

const samples = (diffs: number[]) =>
  diffs.map((d) => ({ observedAccuracy: 0.95 + d, predictedAccuracy: 0.95 }));

describe("computeMapResidual", () => {
  it("returns 0 with fewer than 3 samples", () => {
    expect(computeMapResidual([])).toBe(0);
    expect(computeMapResidual(samples([0.01, 0.01]))).toBe(0);
  });

  it("shrinks the median difference by n/(n+6)", () => {
    // Median 0.01, n = 3 → 0.01 · 3/9.
    expect(computeMapResidual(samples([0.01, 0.01, 0.01]))).toBeCloseTo(
      0.01 * (3 / 9),
      10,
    );
  });

  it("uses the median, not the mean", () => {
    expect(computeMapResidual(samples([0, 0, 0.02]))).toBe(0);
  });

  it("clamps to ±0.012", () => {
    const many = Array.from({ length: 10 }, () => 0.05);
    expect(computeMapResidual(samples(many))).toBe(0.012);
    const manyNegative = Array.from({ length: 10 }, () => -0.05);
    expect(computeMapResidual(samples(manyNegative))).toBe(-0.012);
  });
});
