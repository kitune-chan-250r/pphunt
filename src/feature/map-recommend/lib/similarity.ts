/**
 * Playstyle similarity and collaborative-filtering transport
 * (DESIGN.md §3.2.2 and §3.2.3).
 *
 * Raw accuracies cannot be compared across players directly (a stronger
 * player scores higher everywhere), so accuracies are first converted
 * to relative accuracies `r_{u,m} = a_{u,m} / median_m`, where
 * `median_m` is the median accuracy on that map across all sampled
 * players. Similarity then combines a shrunk Pearson correlation of
 * relative accuracies on shared maps, a relative-accuracy cosine, a
 * characteristic-preference cosine and a Jaccard overlap.
 */
import { normaliseAccuracy } from "./accuracyCurve";

/** A compact per-score summary used for similarity calculations. */
export interface PlayerScoreSummary {
  leaderboardId: number;
  /** Raw API accuracy: a fraction (0–1) or a percent (> 1.5). */
  accuracy: number;
  pp: number;
  stars: number;
  characteristic: string;
}

/** Result of {@link computeSimilarity} (DESIGN.md §3.2.2). */
export interface SimilarityResult {
  /** Combined similarity; 0 when the evidence gate rejects the pair. */
  similarity: number;
  /** Number of maps both players have played, |S|. */
  sharedCount: number;
  /** Raw Pearson correlation of relative accuracies over S. */
  pearson: number;
  /** Pearson after shrinkage `ρ · |S|/(|S|+10)`. */
  pearsonShrunk: number;
  /** Cosine of the relative-accuracy vectors over S. */
  relAccCosine: number;
  /** Cosine of the characteristic count vectors (full score lists). */
  characteristicCosine: number;
  /** |S| / |union of leaderboardIds|. */
  jaccard: number;
}

/** One neighbour observation used by {@link transportAccuracy}. */
export interface TransportSample {
  /** Accuracy the neighbour actually achieved on the map (0–1). */
  neighbourAccuracy: number;
  /** Accuracy the neighbour's own curve predicted for the map (0–1). */
  neighbourPredicted: number;
  /** Similarity weight of the neighbour. */
  similarity: number;
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
};

const cosine = (a: number[], b: number[]): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const pearsonCorrelation = (a: number[], b: number[]): number => {
  const n = a.length;
  if (n < 2) return 0;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varA += (a[i] - meanA) ** 2;
    varB += (b[i] - meanB) ** 2;
  }
  if (varA <= 0 || varB <= 0) return 0;
  return cov / (Math.sqrt(varA) * Math.sqrt(varB));
};

/** Map from leaderboardId to the player's normalised accuracy. */
const accuracyByMap = (
  scores: PlayerScoreSummary[],
): Map<number, number> => {
  const map = new Map<number, number>();
  for (const score of scores) {
    if (!score || !Number.isFinite(score.accuracy)) continue;
    const accuracy = normaliseAccuracy(score.accuracy);
    const existing = map.get(score.leaderboardId);
    // Duplicate entries for one map: keep the best accuracy.
    if (existing === undefined || accuracy > existing) {
      map.set(score.leaderboardId, accuracy);
    }
  }
  return map;
};

/**
 * Median normalised accuracy per map across all given players
 * (DESIGN.md §3.2.2). Only players who have a score on a map contribute
 * to that map's median.
 */
export const computeMapMedianAccuracies = (
  playersScores: PlayerScoreSummary[][],
): Map<number, number> => {
  const byMap = new Map<number, number[]>();
  for (const scores of playersScores) {
    for (const [leaderboardId, accuracy] of accuracyByMap(scores)) {
      const list = byMap.get(leaderboardId) ?? [];
      list.push(accuracy);
      byMap.set(leaderboardId, list);
    }
  }
  const result = new Map<number, number>();
  for (const [leaderboardId, accuracies] of byMap) {
    result.set(leaderboardId, median(accuracies));
  }
  return result;
};

/**
 * Similarity between two players' score lists (DESIGN.md §3.2.2):
 *
 * `sim = 0.55·ρ_shrunk + 0.20·cos_rel + 0.15·cos_char + 0.10·J`
 *
 * Gates: when the shared map count |S| < 5 the Pearson component counts
 * as 0 in the sum (the relative-accuracy cosine still counts), and when
 * additionally the characteristic cosine is below 0.7 the evidence is
 * considered insufficient and `similarity` is exactly 0.
 */
export const computeSimilarity = (
  target: PlayerScoreSummary[],
  other: PlayerScoreSummary[],
  mapMedians: Map<number, number>,
): SimilarityResult => {
  const targetByMap = accuracyByMap(target);
  const otherByMap = accuracyByMap(other);

  const sharedIds = [...targetByMap.keys()].filter((id) =>
    otherByMap.has(id),
  );
  const sharedCount = sharedIds.length;
  const unionSize = new Set([...targetByMap.keys(), ...otherByMap.keys()])
    .size;
  const jaccard = unionSize === 0 ? 0 : sharedCount / unionSize;

  const relative = (accuracy: number, leaderboardId: number): number => {
    const med = mapMedians.get(leaderboardId);
    // Guard a missing or zero median: treat the map as neutral (r = 1).
    return med !== undefined && med > 0 ? accuracy / med : 1;
  };
  const targetRel = sharedIds.map((id) =>
    relative(targetByMap.get(id) as number, id),
  );
  const otherRel = sharedIds.map((id) =>
    relative(otherByMap.get(id) as number, id),
  );

  const pearson =
    sharedCount < 2 ? 0 : pearsonCorrelation(targetRel, otherRel);
  const pearsonShrunk = pearson * (sharedCount / (sharedCount + 10));
  const relAccCosine = sharedCount === 0 ? 0 : cosine(targetRel, otherRel);

  // Characteristic preference cosine over each player's full score list.
  const characteristics = new Set<string>();
  for (const s of target) if (s?.characteristic) characteristics.add(s.characteristic);
  for (const s of other) if (s?.characteristic) characteristics.add(s.characteristic);
  const countVector = (scores: PlayerScoreSummary[]): number[] => {
    const counts = new Map<string, number>();
    for (const s of scores) {
      if (!s?.characteristic) continue;
      counts.set(s.characteristic, (counts.get(s.characteristic) ?? 0) + 1);
    }
    return [...characteristics].map((key) => counts.get(key) ?? 0);
  };
  const characteristicCosine = cosine(countVector(target), countVector(other));

  let similarity =
    0.55 * (sharedCount < 5 ? 0 : pearsonShrunk) +
    0.2 * relAccCosine +
    0.15 * characteristicCosine +
    0.1 * jaccard;
  if (sharedCount < 5 && characteristicCosine < 0.7) {
    similarity = 0;
  }

  return {
    similarity,
    sharedCount,
    pearson,
    pearsonShrunk,
    relAccCosine,
    characteristicCosine,
    jaccard,
  };
};

/**
 * Transport neighbours' results on a map onto the target player's curve
 * (DESIGN.md §3.2.3): each neighbour contributes
 * `a_{v,m} + (â_target(s_m) − â_v(s_m))`, and the result is the
 * similarity-weighted median of those values. Returns null when there
 * are no samples. If every similarity weight is non-positive, equal
 * weights are used so the median is still defined.
 */
export const transportAccuracy = (
  samples: TransportSample[],
  targetPredicted: number,
): number | null => {
  if (samples.length === 0) return null;
  const entries = samples.map((sample) => {
    const neighbourAccuracy =
      sample.neighbourAccuracy > 1.5
        ? normaliseAccuracy(sample.neighbourAccuracy)
        : sample.neighbourAccuracy;
    return {
      value:
        neighbourAccuracy + (targetPredicted - sample.neighbourPredicted),
      weight: Math.max(0, sample.similarity),
    };
  });
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) {
    for (const e of entries) e.weight = 1;
  }
  const effectiveTotal =
    totalWeight <= 0 ? entries.length : totalWeight;
  const sorted = [...entries].sort((a, b) => a.value - b.value);
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.weight;
    if (cumulative >= effectiveTotal / 2) return entry.value;
  }
  return sorted[sorted.length - 1].value;
};
