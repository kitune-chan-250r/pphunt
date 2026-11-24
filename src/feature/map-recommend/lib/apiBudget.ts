/**
 * API 呼び出し予算（DESIGN_V3.md §3.6）。
 *
 * v3 は「近傍の人数を絞って深く取る」取得に組み替えるため、想定呼び出しは
 * 約115回（既定）／最大約155回。ただし想定外の膨張を防ぐため、分析1回あたり
 * の実呼び出し回数にハードキャップを設ける。キャッシュ（IndexedDB）ヒットは
 * ネットワークへ出ないため消費しない。
 *
 * 消費はフェーズ順（自分 → 周辺一覧 → 近傍 → hash確認）に行われるため、
 * 近傍フェーズでは hash 確認分を予約し、近傍だけで予算を使い切らないように
 * する（{@link ApiBudget.remainingAboveReserve}）。
 */

/** 分析1回あたりの API 呼び出しハード上限（DESIGN_V3.md §3.6 の最大値）。 */
export const HARD_API_BUDGET = 155;

export class ApiBudget {
  readonly limit: number;
  #used = 0;

  constructor(limit: number = HARD_API_BUDGET) {
    this.limit = Math.max(0, Math.floor(limit));
  }

  /** これまでに消費した呼び出し回数。 */
  get used(): number {
    return this.#used;
  }

  /** あと何回呼べるか。 */
  get remaining(): number {
    return Math.max(0, this.limit - this.#used);
  }

  /**
   * `n` 回分を消費できれば消費して true、予算不足なら何も消費せず false。
   */
  tryConsume(n = 1): boolean {
    if (!Number.isFinite(n) || n <= 0) return false;
    if (this.#used + n > this.limit) return false;
    this.#used += n;
    return true;
  }

  /**
   * 予約分 `reserve` を残したうえで、あと何回呼べるか。
   * 近傍フェーズが後続の hash 確認フェーズの予算を食い潰さないために使う。
   */
  remainingAboveReserve(reserve: number): number {
    return Math.max(0, this.limit - reserve - this.#used);
  }

  /** 予約分を残して `n` 回分を消費できる場合のみ消費する。 */
  tryConsumeAboveReserve(n: number, reserve: number): boolean {
    if (n > this.remainingAboveReserve(reserve)) return false;
    return this.tryConsume(n);
  }
}
