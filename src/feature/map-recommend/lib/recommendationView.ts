import type { MapRecommendation } from "../hooks/useMapRecommendations";

/**
 * 推薦リストの表示変換（提案5: ソート／フィルタ＋同一曲まとめ）。
 *
 * 既定の「推薦順」は分析側が返した配列順そのもので、v3 の検証済み
 * ランキング（鮮度重み＋ΔPPブレンド）を一切変更しない。ソートは
 * 安定ソートとし、同点の場合は元の順序（＝推薦順）を保つ。
 * フィルタとグループ化は表示だけの変換で、元の配列は変更しない。
 */

export type RecommendationSortKey =
  | "recommended"
  | "deltaPp"
  | "stars"
  | "accuracy";

export interface RecommendationViewOptions {
  sortKey: RecommendationSortKey;
  /** stars の下限（null = 無制限）。境界値は含む。 */
  minStars: number | null;
  /** stars の上限（null = 無制限）。境界値は含む。 */
  maxStars: number | null;
  /** 同じ曲（`leaderboard.map.id`）の複数難易度を1グループにまとめる。 */
  groupBySong: boolean;
}

export interface RecommendationGroup {
  /** グループキー（`leaderboard.map.id`）。 */
  mapId: number;
  /** 代表エントリ（現在の並び順で先頭の難易度）。 */
  head: MapRecommendation;
  /** 代表以外の同じ曲の難易度（現在の並び順）。 */
  others: MapRecommendation[];
}

export interface RecommendationView {
  /** フィルタ通過・ソート後の全件（グループ化前）。プレイリスト書き出しはこちらを使う。 */
  items: MapRecommendation[];
  /** 表示用グループ列。`groupBySong` が false のとき `others` は常に空。 */
  groups: RecommendationGroup[];
}

export const DEFAULT_VIEW_OPTIONS: RecommendationViewOptions = {
  sortKey: "recommended",
  minStars: null,
  maxStars: null,
  groupBySong: true,
};

const sortValue = (
  recommendation: MapRecommendation,
  sortKey: Exclude<RecommendationSortKey, "recommended">,
): number => {
  switch (sortKey) {
    case "deltaPp":
      // 集計途中で display が未付与の間は予測なしとして末尾に置く。
      return (
        recommendation.display?.predictedDeltaPpBest ??
        Number.NEGATIVE_INFINITY
      );
    case "stars":
      return recommendation.leaderboard.realm.stars;
    case "accuracy":
      return recommendation.display?.predictedAccuracy ?? -1;
  }
};

const passesFilter = (
  recommendation: MapRecommendation,
  options: RecommendationViewOptions,
): boolean => {
  const stars = recommendation.leaderboard.realm.stars;
  if (options.minStars !== null && stars < options.minStars) {
    return false;
  }
  if (options.maxStars !== null && stars > options.maxStars) {
    return false;
  }
  return true;
};

export const buildRecommendationView = (
  recommendations: readonly MapRecommendation[],
  options: RecommendationViewOptions,
): RecommendationView => {
  const filtered = recommendations.filter((recommendation) =>
    passesFilter(recommendation, options),
  );

  const { sortKey } = options;
  const items =
    sortKey === "recommended"
      ? filtered
      : filtered
          .map((recommendation, index) => ({ recommendation, index }))
          .sort((a, b) => {
            const diff =
              sortValue(b.recommendation, sortKey) -
              sortValue(a.recommendation, sortKey);
            return diff !== 0 ? diff : a.index - b.index;
          })
          .map(({ recommendation }) => recommendation);

  if (!options.groupBySong) {
    return {
      items,
      groups: items.map((head) => ({
        mapId: head.leaderboard.map.id,
        head,
        others: [],
      })),
    };
  }

  const groups: RecommendationGroup[] = [];
  const groupByMapId = new Map<number, RecommendationGroup>();
  for (const item of items) {
    const mapId = item.leaderboard.map.id;
    const existing = groupByMapId.get(mapId);
    if (existing) {
      existing.others.push(item);
    } else {
      const group: RecommendationGroup = { mapId, head: item, others: [] };
      groupByMapId.set(mapId, group);
      groups.push(group);
    }
  }
  return { items, groups };
};

/** リスト内の最大 stars（フィルタ UI の上限決定用）。空なら 0。 */
export const maxStarsOf = (
  recommendations: readonly MapRecommendation[],
): number =>
  recommendations.reduce(
    (max, recommendation) =>
      Math.max(max, recommendation.leaderboard.realm.stars),
    0,
  );
