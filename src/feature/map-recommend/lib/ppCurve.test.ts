import { describe, expect, it } from "vitest";
import { anchorCurveValue, fitPpCurve, type PpCurveSample } from "./ppCurve";

describe("anchorCurveValue", () => {
  it("anchors at 42.11 for 95% accuracy", () => {
    expect(anchorCurveValue(0.95)).toBeCloseTo(42.11, 10);
  });

  it("rises steeply at 99% accuracy (more than 2.3x the 95% value)", () => {
    expect(anchorCurveValue(0.99) / anchorCurveValue(0.95)).toBeGreaterThan(
      2.3,
    );
  });

  it("clamps the input to [0.5, 0.999]", () => {
    expect(anchorCurveValue(0.1)).toBe(anchorCurveValue(0.5));
    expect(anchorCurveValue(1)).toBe(anchorCurveValue(0.999));
  });
});

describe("fitPpCurve", () => {
  it("has scale 1 and no samples when given no samples", () => {
    const curve = fitPpCurve([]);
    expect(curve.scale).toBe(1);
    expect(curve.sampleCount).toBe(0);
    expect(curve.curveValue(0.95)).toBeCloseTo(42.11, 10);
    expect(curve.predictPp(10, 0.95)).toBeCloseTo(421.1, 6);
  });

  it("recovers a synthetic 1.2x scale (shrunk toward 1 by the prior)", () => {
    const samples: PpCurveSample[] = [];
    const accuracies = [0.9, 0.93, 0.95, 0.97, 0.98];
    for (let i = 0; i < 90; i += 1) {
      const accuracy = accuracies[i % accuracies.length];
      samples.push({
        accuracy,
        stars: 10,
        pp: 10 * anchorCurveValue(accuracy) * 1.2,
      });
    }
    const curve = fitPpCurve(samples);
    expect(curve.sampleCount).toBe(90);
    // (90 · 1.2 + 10 · 1) / 100 = 1.18.
    expect(curve.scale).toBeCloseTo(1.18, 6);
    expect(curve.predictPp(10, 0.95)).toBeCloseTo(10 * 42.11 * 1.18, 4);
  });

  it("filters out samples outside the validity ranges", () => {
    const curve = fitPpCurve([
      { accuracy: 0.95, pp: 421.1, stars: 10 },
      { accuracy: 0.5, pp: 100, stars: 10 },
      { accuracy: 0.95, pp: 0, stars: 10 },
      { accuracy: 0.95, pp: 421.1, stars: 0 },
    ]);
    expect(curve.sampleCount).toBe(1);
  });

  it("accepts percent-scale accuracies in samples", () => {
    const curve = fitPpCurve([
      { accuracy: 95, pp: 10 * anchorCurveValue(0.95) * 1.2, stars: 10 },
    ]);
    expect(curve.sampleCount).toBe(1);
    expect(curve.scale).toBeGreaterThan(1);
  });

  it("clamps extreme scales to [0.4, 2.5]", () => {
    const samples: PpCurveSample[] = Array.from({ length: 200 }, () => ({
      accuracy: 0.95,
      stars: 10,
      pp: 10 * anchorCurveValue(0.95) * 10,
    }));
    expect(fitPpCurve(samples).scale).toBe(2.5);
  });
});
