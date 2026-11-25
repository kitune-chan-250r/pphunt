import { describe, expect, it } from "vitest";
import {
  EFFECTIVE_SECONDS_PER_CALL,
  estimateRemainingCalls,
  estimateRemainingSeconds,
  estimateSecondsForCalls,
  roundEstimateSeconds,
} from "./analysisTimeEstimate";

describe("estimateSecondsForCalls", () => {
  it("実効コストは開始間隔律速の 0.3 秒/コール", () => {
    // max(開始間隔 0.3, 中央値レイテンシ 0.6 / 同時実行 4 = 0.15) = 0.3
    expect(EFFECTIVE_SECONDS_PER_CALL).toBe(0.3);
  });

  it("v3 の構造上の最大 116 コールで約 35 秒", () => {
    expect(estimateSecondsForCalls(116)).toBe(34.8);
  });

  it("近傍がすべてキャッシュヒットした 56 コールで約 17 秒", () => {
    expect(estimateSecondsForCalls(56)).toBe(16.8);
  });

  it("0 コール・負数は 0 秒", () => {
    expect(estimateSecondsForCalls(0)).toBe(0);
    expect(estimateSecondsForCalls(-3)).toBe(0);
  });
});

describe("estimateRemainingCalls", () => {
  const base = {
    completedPlayers: 0,
    totalPlayers: 0,
    checkedMaps: 0,
    totalMaps: 0,
  };

  it("players フェーズは後続を上限（3 + 60 + 50）で見積もる", () => {
    expect(estimateRemainingCalls({ ...base, phase: "players" })).toBe(113);
  });

  it("scores フェーズは残りプレイヤー数 ＋ 個別確認の上限 50", () => {
    expect(
      estimateRemainingCalls({
        ...base,
        phase: "scores",
        totalPlayers: 60,
        completedPlayers: 0,
      }),
    ).toBe(110);
    expect(
      estimateRemainingCalls({
        ...base,
        phase: "scores",
        totalPlayers: 60,
        completedPlayers: 60,
      }),
    ).toBe(50);
  });

  it("maps フェーズは残りの確認数そのもの", () => {
    expect(
      estimateRemainingCalls({
        ...base,
        phase: "maps",
        totalMaps: 50,
        checkedMaps: 10,
      }),
    ).toBe(40);
  });

  it("表示対象外のフェーズでは null", () => {
    for (const phase of ["idle", "player", "done", "error"]) {
      expect(estimateRemainingCalls({ ...base, phase })).toBeNull();
    }
  });
});

describe("estimateRemainingSeconds", () => {
  it("scores 開始直後は 110 コール × 0.3 = 33 秒", () => {
    expect(
      estimateRemainingSeconds({
        phase: "scores",
        completedPlayers: 0,
        totalPlayers: 60,
        checkedMaps: 0,
        totalMaps: 0,
      }),
    ).toBe(33);
  });

  it("done では null", () => {
    expect(
      estimateRemainingSeconds({
        phase: "done",
        completedPlayers: 60,
        totalPlayers: 60,
        checkedMaps: 50,
        totalMaps: 50,
      }),
    ).toBeNull();
  });
});

describe("roundEstimateSeconds", () => {
  it("5 秒単位に丸める", () => {
    expect(roundEstimateSeconds(76.5)).toBe(75);
    expect(roundEstimateSeconds(15.3)).toBe(15);
    expect(roundEstimateSeconds(13)).toBe(15);
    expect(roundEstimateSeconds(12.4)).toBe(10);
  });

  it("最小は 5 秒", () => {
    expect(roundEstimateSeconds(0.3)).toBe(5);
    expect(roundEstimateSeconds(0)).toBe(5);
  });
});
