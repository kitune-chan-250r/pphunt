import { describe, expect, it } from "vitest";
import { blendScores, DELTA_PP_BLEND_LAMBDA } from "./blend";

describe("blendScores", () => {
  it("λ の既定値は 0.5（DESIGN_V3.md §6 の測定条件）", () => {
    expect(DELTA_PP_BLEND_LAMBDA).toBe(0.5);
  });

  it("空・単一候補では全て 0", () => {
    expect(blendScores([])).toEqual([]);
    expect(blendScores([{ freshness: 3, expectedDeltaPp: 10 }])).toEqual([0]);
  });

  it("鮮度と ΔPP の z スコアを λ 倍で加算する", () => {
    // fresh: [0, 10] → 平均5・母SD5 → z = [-1, 1]
    // delta: [0, 20] → 平均10・母SD10 → z = [-1, 1]
    // blend = z_fresh + 0.5 * z_delta = [-1.5, 1.5]
    const scores = blendScores([
      { freshness: 0, expectedDeltaPp: 0 },
      { freshness: 10, expectedDeltaPp: 20 },
    ]);
    expect(scores[0]).toBeCloseTo(-1.5, 10);
    expect(scores[1]).toBeCloseTo(1.5, 10);
  });

  it("ΔPP が逆転要因になる（鮮度で負けても ΔPP で勝てば上位）", () => {
    // fresh z: A=+1, B=-1 / delta z: A=-1, B=+1
    // blend: A = 1 - 0.5 = 0.5, B = -1 + 0.5 = -0.5 → それでも A が上
    const scores = blendScores([
      { freshness: 10, expectedDeltaPp: 0 },
      { freshness: 0, expectedDeltaPp: 20 },
    ]);
    expect(scores[0]).toBeGreaterThan(scores[1]);
    // λ を大きくすれば ΔPP 側が逆転する
    const scoresHighLambda = blendScores(
      [
        { freshness: 10, expectedDeltaPp: 0 },
        { freshness: 0, expectedDeltaPp: 20 },
      ],
      3,
    );
    expect(scoresHighLambda[1]).toBeGreaterThan(scoresHighLambda[0]);
  });

  it("分散が 0 の項目は z=0 として扱う", () => {
    // 全候補の鮮度が同じ → 鮮度の z は全員 0、順位は ΔPP のみで決まる
    const scores = blendScores([
      { freshness: 5, expectedDeltaPp: 0 },
      { freshness: 5, expectedDeltaPp: 10 },
      { freshness: 5, expectedDeltaPp: 20 },
    ]);
    expect(scores[0]).toBeLessThan(scores[1]);
    expect(scores[1]).toBeLessThan(scores[2]);
    expect(scores[1]).toBeCloseTo(0, 10);
  });

  it("負の期待 ΔPP もそのまま z スコア化する（クランプしない）", () => {
    const scores = blendScores([
      { freshness: 0, expectedDeltaPp: -10 },
      { freshness: 0, expectedDeltaPp: 10 },
    ]);
    expect(scores[0]).toBeCloseTo(-0.5, 10);
    expect(scores[1]).toBeCloseTo(0.5, 10);
  });
});
