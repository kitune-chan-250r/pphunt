import { describe, expect, it } from "vitest";
import {
  WEIGHT_DECAY,
  deltaPpForScore,
  insertionIndex,
  totalWeightedPp,
} from "./ppGain";

describe("totalWeightedPp", () => {
  it("weights the top score at 1 and decays by 0.965 per position", () => {
    expect(WEIGHT_DECAY).toBe(0.965);
    expect(totalWeightedPp([100, 90])).toBeCloseTo(100 + 90 * 0.965, 10);
    expect(totalWeightedPp([])).toBe(0);
  });

  it("sorts a copy descending without mutating the input", () => {
    const input = [90, 100, 80];
    expect(totalWeightedPp(input)).toBeCloseTo(
      100 + 90 * 0.965 + 80 * 0.965 ** 2,
      10,
    );
    expect(input).toEqual([90, 100, 80]);
  });
});

describe("insertionIndex", () => {
  it("finds the descending insertion position", () => {
    expect(insertionIndex([100, 90], 95)).toBe(1);
    expect(insertionIndex([100, 90], 110)).toBe(0);
    expect(insertionIndex([100, 90], 80)).toBe(2);
    expect(insertionIndex([], 50)).toBe(0);
  });

  it("places a new score after existing equals (documented tie rule)", () => {
    expect(insertionIndex([100, 95, 90], 95)).toBe(2);
  });
});

describe("deltaPpForScore", () => {
  it("matches a hand-computed insertion into [100, 90]", () => {
    // Before: 100 + 90·0.965 = 186.85.
    // After [100, 95, 90]: 100 + 95·0.965 + 90·0.965² = 275.48525.
    // Delta = 88.63525 (also: 0.965·95 − 0.035·0.965·90).
    expect(deltaPpForScore([100, 90], 95)).toBeCloseTo(88.63525, 8);
  });

  it("matches the DESIGN.md §3.1.4 push-down formula", () => {
    const profile = [120, 110, 100, 90];
    const newPp = 105;
    // Inserted at position k = 3 (1-based): gain 0.965²·105 minus
    // 3.5% of the weighted sum of everything from position 3 down.
    const pushed = 100 * 0.965 ** 2 + 90 * 0.965 ** 3;
    const expected = 0.965 ** 2 * newPp - 0.035 * pushed;
    expect(deltaPpForScore(profile, newPp)).toBeCloseTo(expected, 8);
  });

  it("removes the replaced score before inserting (improvement case)", () => {
    // Before [100, 90] = 186.85; after removing 90 and inserting 95:
    // [100, 95] = 191.675; delta = 4.825.
    expect(deltaPpForScore([100, 90], 95, 90)).toBeCloseTo(4.825, 8);
  });

  it("removes only one occurrence of the replaced score", () => {
    // Before [90, 90, 80] = 90 + 86.85 + 74.498 = 251.348.
    // After removing one 90 and inserting 85: [90, 85, 80]
    // = 90 + 82.025 + 74.498 = 246.523; delta = -4.825.
    expect(deltaPpForScore([90, 90, 80], 85, 90)).toBeCloseTo(-4.825, 8);
  });

  it("can be negative when the new score is worse than the replaced one", () => {
    expect(deltaPpForScore([100, 90], 50, 90)).toBeLessThan(0);
  });

  it("does not mutate the profile array", () => {
    const profile = [100, 90];
    deltaPpForScore(profile, 95, 90);
    expect(profile).toEqual([100, 90]);
  });
});
