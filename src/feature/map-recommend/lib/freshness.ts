/**
 * 鮮度重み付き出現スコア（DESIGN_V3.md §3.3）。
 *
 * v2 フルモデルは層化バックテストで現行方式に敗れたが、オフライン再評価では
 * 「出現人数をプレイ日時の新しさで重み付けする」変更だけが唯一の明確な勝者
 * だった（NDCG@20 0.100 → 0.116、相対 +16%）。本モジュールはその重み付けを
 * 純粋関数として切り出したもので、順位付けの主軸として使う。
 *
 *   fresh(m) = Σ_j 2^(−(T_ref − t_jm) / H)
 *
 * ここで t_jm は近傍プレイヤー j がその譜面でベストスコアを出した日時、
 * H は半減期（日）。重みは「その譜面を近傍が最近どれだけ触っているか」
 * ＝現在のメタへの追随度を表す。
 */

const DAY_MS = 86_400_000;

/** 上位層向けの半減期（日）。オフライン評価で +0.016 を実測した値。 */
export const HALF_LIFE_TOP_BAND_DAYS = 180;
/** 下位層向けの半減期（日）。鮮度重みを弱める設定（DESIGN_V3.md §3.5）。 */
export const HALF_LIFE_LOWER_BAND_DAYS = 365;
/** H=180 を適用する層の上限ランク。 */
export const TOP_BAND_MAX_RANK = 1000;
/** 鮮度重みを無効化する層の上限ランク（1001–5000 層）。 */
export const MID_BAND_MAX_RANK = 5000;

/**
 * 対象プレイヤーのランク帯に応じた半減期（日）を返す。
 * `null` は鮮度重みの無効化（スコア = 出現人数そのもの）を表す。
 *
 * - ランク 1–1000: H=180（V3-C の実測条件）
 * - ランク 1001–5000: 無効（Phase 2 確定、DESIGN_V3.md §3.5 / §8。
 *   §6 フレッシュバックテストで H=365 が現行方式より悪化し
 *   （NDCG@20 0.030 vs 0.043）、オフラインの H=180 でも微減だったため、
 *   この層では鮮度重みを使わず出現人数順とする）
 * - ランク 5001 以降: H=365（評価不能な層のため Phase 1 の暫定を維持し、
 *   この層向けの最適化は主張しない）
 */
export const halfLifeDaysForRank = (rank: number): number | null => {
  if (rank <= TOP_BAND_MAX_RANK) return HALF_LIFE_TOP_BAND_DAYS;
  if (rank <= MID_BAND_MAX_RANK) return null;
  return HALF_LIFE_LOWER_BAND_DAYS;
};

/**
 * 1件のプレイに対する鮮度重み `2^(−age/H)`。
 * 未来の日時（時計ずれ等）は重み 1 にクランプする。
 */
export const freshnessWeight = (
  playedAtMs: number,
  referenceMs: number,
  halfLifeDays: number,
): number => {
  if (!Number.isFinite(playedAtMs) || !Number.isFinite(referenceMs)) {
    return 0;
  }
  if (!(halfLifeDays > 0)) return 0;
  const ageDays = Math.max(0, (referenceMs - playedAtMs) / DAY_MS);
  return Math.pow(2, -ageDays / halfLifeDays);
};

/**
 * 譜面に対する鮮度重み付き出現スコア: 近傍全員のプレイ日時の重みの合計。
 * 日時はミリ秒（`Date.parse` 済み）で渡す。パースできない日時は呼び出し側で
 * 除外すること（重み 0 として扱いたい場合は {@link freshnessWeight} が
 * 非有限値を 0 にする）。
 */
export const freshnessScore = (
  playedAtMsList: readonly number[],
  referenceMs: number,
  halfLifeDays: number,
): number =>
  playedAtMsList.reduce(
    (sum, playedAtMs) =>
      sum + freshnessWeight(playedAtMs, referenceMs, halfLifeDays),
    0,
  );

/**
 * 直近 `windowDays` 日以内にその譜面をプレイした近傍プレイヤーの人数。
 * 表示用（「直近90日に触れた人数」、DESIGN_V3.md §3.4）。
 */
export const countRecentPlayers = (
  playedAtMsList: readonly number[],
  referenceMs: number,
  windowDays = 90,
): number => {
  const windowMs = windowDays * DAY_MS;
  return playedAtMsList.filter(
    (playedAtMs) =>
      Number.isFinite(playedAtMs) &&
      referenceMs - playedAtMs >= 0 &&
      referenceMs - playedAtMs <= windowMs,
  ).length;
};
