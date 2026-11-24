/**
 * Exact total-PP gain calculation (DESIGN.md §3.1.4).
 *
 * Total PP is the weighted sum of raw PP sorted descending with weights
 * `0.965^i` (i 0-based, so the top score has weight 1). Inserting a new
 * score pushes every score below it down one position, which costs each
 * of them 3.5% of its weighted contribution; this module computes the
 * resulting difference exactly instead of approximating it.
 */

/** Per-position weight decay of the total-PP sum (DESIGN.md §3.1.4). */
export const WEIGHT_DECAY = 0.965;

/**
 * Total weighted PP of a profile: `Σ pp_i · 0.965^i` over the raw PP
 * values sorted descending (i is 0-based). The input is copied before
 * sorting, so the caller's array is never mutated.
 */
export const totalWeightedPp = (ppsDesc: number[]): number => {
  const sorted = [...ppsDesc].sort((a, b) => b - a);
  let total = 0;
  sorted.forEach((pp, i) => {
    total += pp * Math.pow(WEIGHT_DECAY, i);
  });
  return total;
};

/**
 * Index at which `newPp` should be inserted to keep descending order.
 *
 * Tie rule (documented choice): the index is the number of entries
 * `>= newPp`, so a new score is placed *after* existing scores of equal
 * PP. Because the tied values are equal, this choice does not change
 * {@link totalWeightedPp} of the resulting list.
 */
export const insertionIndex = (ppsDesc: number[], newPp: number): number => {
  const sorted = [...ppsDesc].sort((a, b) => b - a);
  let index = 0;
  while (index < sorted.length && sorted[index] >= newPp) index += 1;
  return index;
};

/**
 * Exact change in total weighted PP from gaining a score of `newPp`
 * raw PP (DESIGN.md §3.1.4).
 *
 * When `replacedPp` is given (an improvement on an already-played map),
 * one occurrence of that value is removed from the profile before the
 * new score is inserted. The baseline is the profile *with* the replaced
 * score still included, so the result is the true net gain and can be
 * negative (e.g. replacing a score with a lower one, or a tiny new score
 * deep in the profile whose push-down cost outweighs its contribution).
 */
export const deltaPpForScore = (
  profilePpsDesc: number[],
  newPp: number,
  replacedPp?: number,
): number => {
  const before = totalWeightedPp(profilePpsDesc);
  const after = [...profilePpsDesc];
  if (replacedPp !== undefined) {
    const removeAt = after.indexOf(replacedPp);
    if (removeAt >= 0) after.splice(removeAt, 1);
  }
  after.push(newPp);
  return totalWeightedPp(after) - before;
};
