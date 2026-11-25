/**
 * 鮮度スコアと期待 ΔPP の z スコアブレンド（DESIGN_V3.md §3.3 / §6、
 * V3-B2 の本採用版）。
 *
 *   score(m) = z(fresh(m)) + λ · z(期待ΔPP(m)),  λ = 0.5
 *
 * z スコアは候補全体（未プレイ候補＋更新候補の合算）に対する母標準偏差で
 * 計算する（§6 ハーネスの (iii) と同じ定義）。オフライン評価では単独効果が
 * +0.0022 と誤差範囲だったが、§6 フレッシュバックテストで鮮度重みとの
 * 併用効果が全体 NDCG@20 +0.0195（(ii) 比）・現行方式比 +0.0286 と
 * 確認できたため Phase 2 で本採用した（BACKTEST_V3.md）。
 *
 * 期待 ΔPP の推定器はオフライン評価・§6 ハーネスと同一:
 * 個人の精度–stars カーブで予測精度を求め、自己校正 PP カーブで PP に
 * 変換し、`ppGain.ts` の正確な ΔPP を取る。算出は呼び出し側（フック）が
 * 行い、本モジュールはブレンドの数式だけを担う。
 */

/** ΔPP ブレンド係数 λ（DESIGN_V3.md §6 の測定条件）。 */
export const DELTA_PP_BLEND_LAMBDA = 0.5;

export interface BlendInput {
  /** 鮮度重み付き出現スコア（鮮度無効層では出現人数）。 */
  freshness: number;
  /** 期待 ΔPP（推定器による予測値）。 */
  expectedDeltaPp: number;
}

const mean = (values: number[]): number =>
  values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

const populationSd = (values: number[], average: number): number =>
  values.length > 0
    ? Math.sqrt(
        values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
          values.length,
      )
    : 0;

const zScore = (value: number, average: number, sd: number): number =>
  sd > 0 ? (value - average) / sd : 0;

/**
 * 候補列に対するブレンドスコアを入力と同じ順序で返す。
 * 候補が 0〜1 件、または分散が 0 の場合は z スコアが 0 になり、
 * 全候補同点（呼び出し側のタイブレークに委ねられる）。
 */
export const blendScores = (
  inputs: readonly BlendInput[],
  lambda: number = DELTA_PP_BLEND_LAMBDA,
): number[] => {
  const freshValues = inputs.map((input) => input.freshness);
  const deltaValues = inputs.map((input) => input.expectedDeltaPp);
  const freshMean = mean(freshValues);
  const freshSd = populationSd(freshValues, freshMean);
  const deltaMean = mean(deltaValues);
  const deltaSd = populationSd(deltaValues, deltaMean);
  return inputs.map(
    (input) =>
      zScore(input.freshness, freshMean, freshSd) +
      lambda * zScore(input.expectedDeltaPp, deltaMean, deltaSd),
  );
};
