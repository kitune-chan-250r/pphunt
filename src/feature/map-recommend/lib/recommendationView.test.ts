import { describe, expect, it } from "vitest";
import type { MapRecommendation } from "../hooks/useMapRecommendations";
import {
  buildRecommendationView,
  DEFAULT_VIEW_OPTIONS,
  maxStarsOf,
  type RecommendationViewOptions,
} from "./recommendationView";

const makeRecommendation = (overrides: {
  id: number;
  mapId: number;
  difficulty?: number;
  stars?: number;
  deltaPp?: number;
  accuracy?: number;
  withDisplay?: boolean;
}): MapRecommendation =>
  ({
    leaderboard: {
      id: overrides.id,
      map: { id: overrides.mapId },
      difficulty: { difficulty: overrides.difficulty ?? 7 },
      realm: { stars: overrides.stars ?? 0 },
    },
    kind: "UNPLAYED",
    appearanceCount: 1,
    freshnessScore: 0,
    competitor: { id: "p1", name: "P1", rank: 1, score: {} },
    myScore: null,
    display:
      overrides.withDisplay === false
        ? undefined
        : {
            predictedDeltaPpBest: overrides.deltaPp ?? 0,
            predictedDeltaPpMedian: 0,
            predictedAccuracy: overrides.accuracy ?? 0,
            isAboveCurve: false,
            recentPlayerCount: 0,
          },
  }) as unknown as MapRecommendation;

const view = (
  recommendations: MapRecommendation[],
  options: Partial<RecommendationViewOptions> = {},
) =>
  buildRecommendationView(recommendations, {
    ...DEFAULT_VIEW_OPTIONS,
    groupBySong: false,
    ...options,
  });

const ids = (items: MapRecommendation[]) =>
  items.map((item) => item.leaderboard.id);

describe("buildRecommendationView のソート", () => {
  it("推薦順は入力順をそのまま保つ", () => {
    const input = [
      makeRecommendation({ id: 1, mapId: 10, deltaPp: 5 }),
      makeRecommendation({ id: 2, mapId: 11, deltaPp: 50 }),
      makeRecommendation({ id: 3, mapId: 12, deltaPp: 20 }),
    ];
    expect(ids(view(input).items)).toEqual([1, 2, 3]);
  });

  it("予測+ΔPP順は降順で、同点は推薦順を保つ", () => {
    const input = [
      makeRecommendation({ id: 1, mapId: 10, deltaPp: 20 }),
      makeRecommendation({ id: 2, mapId: 11, deltaPp: 50 }),
      makeRecommendation({ id: 3, mapId: 12, deltaPp: 50 }),
      makeRecommendation({ id: 4, mapId: 13, deltaPp: 5 }),
    ];
    expect(ids(view(input, { sortKey: "deltaPp" }).items)).toEqual([
      2, 3, 1, 4,
    ]);
  });

  it("display 未付与（集計途中）は ΔPP順・精度順で末尾に沈む", () => {
    const input = [
      makeRecommendation({ id: 1, mapId: 10, withDisplay: false }),
      makeRecommendation({ id: 2, mapId: 11, deltaPp: 3, accuracy: 0.9 }),
    ];
    expect(ids(view(input, { sortKey: "deltaPp" }).items)).toEqual([2, 1]);
    expect(ids(view(input, { sortKey: "accuracy" }).items)).toEqual([2, 1]);
  });

  it("stars順・予測精度順は降順", () => {
    const input = [
      makeRecommendation({ id: 1, mapId: 10, stars: 8, accuracy: 0.99 }),
      makeRecommendation({ id: 2, mapId: 11, stars: 12, accuracy: 0.95 }),
      makeRecommendation({ id: 3, mapId: 12, stars: 10, accuracy: 0.97 }),
    ];
    expect(ids(view(input, { sortKey: "stars" }).items)).toEqual([2, 3, 1]);
    expect(ids(view(input, { sortKey: "accuracy" }).items)).toEqual([1, 3, 2]);
  });

  it("入力配列を変更しない", () => {
    const input = [
      makeRecommendation({ id: 1, mapId: 10, deltaPp: 5 }),
      makeRecommendation({ id: 2, mapId: 11, deltaPp: 50 }),
    ];
    view(input, { sortKey: "deltaPp" });
    expect(ids(input)).toEqual([1, 2]);
  });
});

describe("buildRecommendationView のフィルタ", () => {
  const input = [
    makeRecommendation({ id: 1, mapId: 10, difficulty: 7, stars: 8 }),
    makeRecommendation({ id: 2, mapId: 11, difficulty: 9, stars: 11 }),
    makeRecommendation({ id: 3, mapId: 12, difficulty: 5, stars: 6 }),
  ];

  it("starsフィルタは境界値を含む", () => {
    expect(ids(view(input, { minStars: 8, maxStars: 11 }).items)).toEqual([
      1, 2,
    ]);
    expect(ids(view(input, { minStars: 8.5 }).items)).toEqual([2]);
    expect(ids(view(input, { maxStars: 7 }).items)).toEqual([3]);
  });

  it("フィルタ未指定では難易度によらず全件が残る", () => {
    expect(ids(view(input).items)).toEqual([1, 2, 3]);
  });
});

describe("buildRecommendationView の同一曲まとめ", () => {
  const input = [
    makeRecommendation({ id: 1, mapId: 10, difficulty: 7, deltaPp: 30 }),
    makeRecommendation({ id: 2, mapId: 11, difficulty: 7, deltaPp: 90 }),
    makeRecommendation({ id: 3, mapId: 10, difficulty: 9, deltaPp: 50 }),
    makeRecommendation({ id: 4, mapId: 10, difficulty: 5, deltaPp: 10 }),
  ];

  it("同じ map.id をまとめ、代表は現在の並びで先頭の難易度", () => {
    const { groups, items } = view(input, {
      sortKey: "deltaPp",
      groupBySong: true,
    });
    // ΔPP順の flat 列（書き出し用）は全件が並ぶ
    expect(ids(items)).toEqual([2, 3, 1, 4]);
    expect(groups).toHaveLength(2);
    expect(groups[0].mapId).toBe(11);
    // map 10 は ΔPP 50 の難易度（id 3）が代表になり、残りは others へ
    expect(groups[1].mapId).toBe(10);
    expect(groups[1].head.leaderboard.id).toBe(3);
    expect(ids(groups[1].others)).toEqual([1, 4]);
  });

  it("まとめても items（書き出し対象）からは1件も欠けない", () => {
    const { groups, items } = view(input, { groupBySong: true });
    const groupedCount = groups.reduce(
      (sum, group) => sum + 1 + group.others.length,
      0,
    );
    expect(groupedCount).toBe(items.length);
    expect(items).toHaveLength(4);
  });

  it("groupBySong=false では全件が単独グループになる", () => {
    const { groups } = view(input, { groupBySong: false });
    expect(groups).toHaveLength(4);
    expect(groups.every((group) => group.others.length === 0)).toBe(true);
  });
});

describe("maxStarsOf", () => {
  it("最大 stars を返し、空なら 0", () => {
    expect(maxStarsOf([])).toBe(0);
    expect(
      maxStarsOf([
        makeRecommendation({ id: 1, mapId: 10, stars: 9.5 }),
        makeRecommendation({ id: 2, mapId: 11, stars: 12.25 }),
      ]),
    ).toBe(12.25);
  });
});
