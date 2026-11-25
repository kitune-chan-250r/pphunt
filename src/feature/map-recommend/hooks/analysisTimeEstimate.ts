/**
 * 推薦分析の所要時間の目安を、その実行が予定する API コール数から算出する。
 *
 * 根拠（2026-11-24 実測: 対象プレイヤー rank 2,950 ＋ 近傍 20 人、全 66 コール、429 なし）:
 * - ScoreSaber API の単発レイテンシ中央値は、分析の大半を占める
 *   scores top limit=50 で 0.594 秒（他エンドポイントも 0.45〜0.69 秒）。
 * - ただし律速は scoreSaberClient のリミッタ（同時実行 4・開始間隔 300ms）。
 *   中央値レイテンシ約 0.6 秒は「同時実行 4 × 開始間隔 0.3 秒 = 1.2 秒」より
 *   小さいため開始間隔が支配的になり、実効コストは 1 コールあたり
 *   max(0.3, 0.6 / 4) = 0.3 秒で近似できる。
 * - 実測見積もりとの突合: 旧パイプライン最大 255 コール → 76.5 秒
 *   （実測ベースの見積もり約 77 秒と一致）。
 * - v3 パイプライン（useMapRecommendations）のコール内訳は、自分 3 回
 *   （player フェーズ、表示対象外）＋ 周辺ページ最大 3 回 ＋ 近傍最大 60 回
 *   ＋ hash 確認最大 50 回で、構造上の最大は 116 コール → 約 35 秒。
 *   近傍がすべて IndexedDB キャッシュにヒットした場合は近傍分が 0 になり、
 *   56 コール → 約 17 秒。ApiBudget のハード上限（155）は構造上の最大を
 *   上回るため、通常は到達しない。
 *
 * scoreSaberClient.ts の DEFAULT_CONCURRENCY /
 * DEFAULT_MINIMUM_REQUEST_INTERVAL_MS を変えたら、下の定数も合わせること。
 */

/** リミッタの最小リクエスト開始間隔（秒）。scoreSaberClient の 300ms と対応。 */
export const REQUEST_START_INTERVAL_SECONDS = 0.3;

/** リミッタの同時実行数。scoreSaberClient の DEFAULT_CONCURRENCY と対応。 */
export const CLIENT_CONCURRENCY = 4;

/** 単発レイテンシの中央値（秒）。2026-11-24 実測 0.594 秒を丸めた値。 */
export const MEDIAN_CALL_LATENCY_SECONDS = 0.6;

/** 開始間隔律速とレイテンシ律速のうち支配的な方を採る実効コスト（秒/コール）。 */
export const EFFECTIVE_SECONDS_PER_CALL = Math.max(
  REQUEST_START_INTERVAL_SECONDS,
  MEDIAN_CALL_LATENCY_SECONDS / CLIENT_CONCURRENCY,
);

/** 予定コール数から所要時間（秒）を見積もる。 */
export const estimateSecondsForCalls = (callCount: number): number =>
  Math.max(0, Math.floor(callCount)) * EFFECTIVE_SECONDS_PER_CALL;

/**
 * v3 パイプラインの計画上限（useMapRecommendations の実装と対応）。
 * 周辺プレイヤー取得は rank ±100 を limit=100 で読むため最大 3 ページ。
 */
const AROUND_RANK_CALLS = 3;
/** 近傍プレイヤーの上限（フック側の NEIGHBOUR_LIMIT）。 */
const MAX_NEIGHBOURS = 60;
/** 未プレイ候補の個別確認の上限（フック側の MAX_RECOMMENDATIONS）。 */
const MAX_MAP_CHECKS = 50;

/** 進捗スナップショット（useMapRecommendations の state の部分集合）。 */
export interface AnalysisProgressSnapshot {
  phase: string;
  completedPlayers: number;
  totalPlayers: number;
  checkedMaps: number;
  totalMaps: number;
}

/**
 * 現フェーズから残りコール数を見積もる。表示対象外のフェーズでは null。
 * - players: 周辺取得の途中。後続は上限いっぱいで見積もる
 *   （近傍のキャッシュ状況はこの時点では分からないため、キャッシュなし前提）。
 * - scores: 残りのプレイヤー数 ＋ 個別確認の上限（候補数はこの時点では未確定）。
 *   キャッシュヒットした近傍はコールなしで完了数に数えられるため、
 *   残りプレイヤー数は実際の進み具合に追随して減っていく。
 * - maps: 残りの確認数そのもの。
 */
export const estimateRemainingCalls = (
  progress: AnalysisProgressSnapshot,
): number | null => {
  switch (progress.phase) {
    case "players":
      return AROUND_RANK_CALLS + MAX_NEIGHBOURS + MAX_MAP_CHECKS;
    case "scores":
      return (
        Math.max(0, progress.totalPlayers - progress.completedPlayers) +
        MAX_MAP_CHECKS
      );
    case "maps":
      return Math.max(0, progress.totalMaps - progress.checkedMaps);
    default:
      return null;
  }
};

/** 残り時間の目安（秒）。表示対象外のフェーズでは null。 */
export const estimateRemainingSeconds = (
  progress: AnalysisProgressSnapshot,
): number | null => {
  const remainingCalls = estimateRemainingCalls(progress);
  return remainingCalls === null
    ? null
    : estimateSecondsForCalls(remainingCalls);
};

/** 表示用に 5 秒単位へ丸める（最小 5 秒）。偽の精密さを避けるための丸め。 */
export const roundEstimateSeconds = (seconds: number): number =>
  Math.max(5, Math.round(seconds / 5) * 5);
