/**
 * Diversity re-ranking with Maximal Marginal Relevance
 * (DESIGN.md §3.2.3, final paragraph).
 *
 * After candidates are ranked by predicted ΔPP, a greedy MMR pass
 * (λ = 0.3 by default) demotes near-duplicates of already-selected
 * items — another difficulty of the same song, the same mapper, or the
 * same characteristic in the same stars band — so the top of the list
 * is not filled with a single kind of map.
 */

/** Identity features of an item used for the MMR penalty. */
export interface MmrItemKey {
  /** Song identity: two difficulties of one song share a songId. */
  songId: string | number;
  mapper?: string | null;
  characteristic?: string | null;
  /** Stars band label; compared for equality. */
  starsBand?: string | number | null;
  /** Raw stars, used to derive a band when `starsBand` is absent. */
  stars?: number | null;
}

/** Options accepted by {@link mmrRerank}. */
export interface MmrOptions<T> {
  /** Relevance weight λ (DESIGN.md §3.2.3 uses 0.3). Default 0.3. */
  lambda?: number;
  /** Maximum number of items to return. Defaults to all items. */
  limit?: number;
  /** Extract the identity features of an item. */
  key: (item: T) => MmrItemKey;
  /** Extract the relevance score of an item. */
  score: (item: T) => number;
}

const bandOf = (key: MmrItemKey): string | number | null => {
  if (key.starsBand !== undefined && key.starsBand !== null) {
    return key.starsBand;
  }
  if (key.stars !== undefined && key.stars !== null && Number.isFinite(key.stars)) {
    return Math.floor(key.stars);
  }
  return null;
};

/**
 * Penalty between two keys: 1.0 for the same song, 0.5 for the same
 * mapper, 0.3 for the same characteristic *and* the same stars band.
 * When several apply, the maximum is taken.
 */
const penaltyBetween = (a: MmrItemKey, b: MmrItemKey): number => {
  let penalty = 0;
  if (
    a.songId !== undefined &&
    a.songId !== null &&
    a.songId === b.songId
  ) {
    penalty = Math.max(penalty, 1.0);
  }
  if (a.mapper && b.mapper && a.mapper === b.mapper) {
    penalty = Math.max(penalty, 0.5);
  }
  const bandA = bandOf(a);
  const bandB = bandOf(b);
  if (
    a.characteristic &&
    b.characteristic &&
    a.characteristic === b.characteristic &&
    bandA !== null &&
    bandA === bandB
  ) {
    penalty = Math.max(penalty, 0.3);
  }
  return penalty;
};

/**
 * Greedy MMR re-ranking (DESIGN.md §3.2.3).
 *
 * Scores are normalised by the maximum score (guarded against 0).
 * Each step selects the remaining item maximising
 * `λ · normalisedScore − (1 − λ) · maxPenaltyVsAlreadySelected`,
 * where the penalty against an empty selection is 0. Ties are broken
 * by higher raw score, then by original order. Returns the top
 * `limit` items in selection order.
 */
export const mmrRerank = <T>(
  items: T[],
  options: MmrOptions<T>,
): T[] => {
  const lambda = options.lambda ?? 0.3;
  const limit = options.limit ?? items.length;
  if (limit <= 0 || items.length === 0) return [];

  const entries = items.map((item, index) => ({
    item,
    index,
    key: options.key(item),
    score: options.score(item),
  }));
  const maxScore = entries.reduce(
    (max, e) => Math.max(max, e.score),
    Number.NEGATIVE_INFINITY,
  );
  const normalised = (score: number): number =>
    maxScore > 0 && Number.isFinite(maxScore) ? score / maxScore : 0;

  const remaining = [...entries];
  const selected: typeof entries = [];
  while (remaining.length > 0 && selected.length < limit) {
    let bestPos = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    let bestScore = Number.NEGATIVE_INFINITY;
    remaining.forEach((entry, pos) => {
      let maxPenalty = 0;
      for (const chosen of selected) {
        maxPenalty = Math.max(
          maxPenalty,
          penaltyBetween(entry.key, chosen.key),
        );
      }
      const value =
        lambda * normalised(entry.score) - (1 - lambda) * maxPenalty;
      if (
        value > bestValue ||
        (value === bestValue && entry.score > bestScore)
      ) {
        bestValue = value;
        bestScore = entry.score;
        bestPos = pos;
      }
    });
    const [chosen] = remaining.splice(bestPos, 1);
    selected.push(chosen);
  }
  return selected.map((e) => e.item);
};
