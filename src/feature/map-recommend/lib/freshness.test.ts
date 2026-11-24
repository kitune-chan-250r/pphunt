import { describe, expect, it } from "vitest";
import {
  countRecentPlayers,
  freshnessScore,
  freshnessWeight,
  halfLifeDaysForRank,
  HALF_LIFE_LOWER_BAND_DAYS,
  HALF_LIFE_TOP_BAND_DAYS,
} from "./freshness";

const DAY = 86_400_000;
const REF = Date.parse("2026-01-01T00:00:00.000Z");

describe("halfLifeDaysForRank", () => {
  it("ランク1000までは半減期180日", () => {
    expect(halfLifeDaysForRank(1)).toBe(HALF_LIFE_TOP_BAND_DAYS);
    expect(halfLifeDaysForRank(500)).toBe(180);
    expect(halfLifeDaysForRank(1000)).toBe(180);
  });

  it("ランク1001–5000は鮮度重み無効（null、Phase 2 確定）", () => {
    expect(halfLifeDaysForRank(1001)).toBeNull();
    expect(halfLifeDaysForRank(3000)).toBeNull();
    expect(halfLifeDaysForRank(5000)).toBeNull();
  });

  it("ランク5001以降は半減期365日（評価不能な層の暫定）", () => {
    expect(halfLifeDaysForRank(5001)).toBe(HALF_LIFE_LOWER_BAND_DAYS);
    expect(halfLifeDaysForRank(20000)).toBe(365);
  });
});

describe("freshnessWeight", () => {
  it("プレイ直後は重み1", () => {
    expect(freshnessWeight(REF, REF, 180)).toBe(1);
  });

  it("半減期ぶん古いと重み0.5、2倍で0.25", () => {
    expect(freshnessWeight(REF - 180 * DAY, REF, 180)).toBeCloseTo(0.5, 10);
    expect(freshnessWeight(REF - 360 * DAY, REF, 180)).toBeCloseTo(0.25, 10);
  });

  it("半減期が長いほど減衰が緩やか", () => {
    const at180 = freshnessWeight(REF - 365 * DAY, REF, 180);
    const at365 = freshnessWeight(REF - 365 * DAY, REF, 365);
    expect(at365).toBeCloseTo(0.5, 10);
    expect(at180).toBeLessThan(at365);
  });

  it("未来の日時は重み1にクランプする", () => {
    expect(freshnessWeight(REF + 30 * DAY, REF, 180)).toBe(1);
  });

  it("非有限の入力は0", () => {
    expect(freshnessWeight(Number.NaN, REF, 180)).toBe(0);
    expect(freshnessWeight(REF, Number.NaN, 180)).toBe(0);
    expect(freshnessWeight(REF, REF, 0)).toBe(0);
  });
});

describe("freshnessScore", () => {
  it("出現人数ではなく重みの合計になる", () => {
    const dates = [REF, REF - 180 * DAY, REF - 180 * DAY];
    expect(freshnessScore(dates, REF, 180)).toBeCloseTo(2, 10);
  });

  it("同じ出現人数なら新しいプレイが多い譜面が高くなる", () => {
    const fresh = freshnessScore([REF - 10 * DAY, REF - 20 * DAY], REF, 180);
    const stale = freshnessScore(
      [REF - 300 * DAY, REF - 400 * DAY],
      REF,
      180,
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  it("空リストは0", () => {
    expect(freshnessScore([], REF, 180)).toBe(0);
  });
});

describe("countRecentPlayers", () => {
  it("直近90日以内にプレイした人数を数える", () => {
    const dates = [
      REF,
      REF - 89 * DAY,
      REF - 90 * DAY,
      REF - 91 * DAY,
      REF - 300 * DAY,
    ];
    expect(countRecentPlayers(dates, REF)).toBe(3);
  });

  it("未来の日時は数えない", () => {
    expect(countRecentPlayers([REF + DAY], REF)).toBe(0);
  });
});
