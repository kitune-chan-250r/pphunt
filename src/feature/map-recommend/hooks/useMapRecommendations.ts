import { useEffect, useState } from "react";
import { useScoreSaber } from "../../scoresaber/hooks/useScoreSaber";
import type {
  Leaderboard,
  PlayerProfile,
  PlayerScoreEntry,
  Score,
} from "../../scoresaber/types/ScoreSaber";
import {
  fitAccuracyCurve,
  normaliseAccuracy,
  type AccuracyCurve,
  type AccuracyObservation,
} from "../lib/accuracyCurve";
import { fitPpCurve, type PpCurve } from "../lib/ppCurve";
import { deltaPpForScore } from "../lib/ppGain";
import {
  computeMapMedianAccuracies,
  computeSimilarity,
  transportAccuracy,
  type PlayerScoreSummary,
} from "../lib/similarity";
import { computeMapResidual } from "../lib/mapResidual";
import { mmrRerank } from "../lib/diversity";
import {
  getPersistentCache,
  setPersistentCache,
  NEIGHBOUR_CACHE_TTL_MS,
} from "../lib/cache";

export type RecommendationKind = "UNPLAYED" | "IMPROVEMENT";

/** 推薦の根拠タグ（DESIGN.md §3.5）。 */
export type RecommendationSource = "UPDATE" | "SIMILAR" | "CHALLENGE";

/** 候補譜面に対する予測内訳（DESIGN.md §3.1.4–3.1.5, §3.2.3）。 */
export interface RecommendationPrediction {
  /** 予測精度（0–1）。協調フィルタリング併用時はブレンド後の値。 */
  predictedAccuracy: number;
  /** 予測 raw PP。 */
  predictedPp: number;
  /** 総 PP 増分の期待値（重み 0.965^n 込みの正確計算）。 */
  expectedDeltaPp: number;
  /** 総 PP 増分の下側信頼限界（片側80%）。並び順の主キー。 */
  lcbDeltaPp: number;
  /** 期待値と LCB の乖離が大きい（予測の分散が大きい）候補。 */
  highVariance: boolean;
  /** 根拠タグ。 */
  sources: RecommendationSource[];
  /** この譜面をプレイしていた類似プレイヤーの人数。 */
  similarPlayerCount: number;
}

export interface MapRecommendation {
  leaderboard: Leaderboard;
  kind: RecommendationKind;
  appearanceCount: number;
  competitor: {
    id: string;
    name: string;
    rank: number;
    score: Score;
  };
  myScore: Score | null;
  prediction?: RecommendationPrediction;
}

type AnalysisPhase =
  | "idle"
  | "player"
  | "players"
  | "scores"
  | "maps"
  | "done"
  | "error";

interface MapRecommendationsState {
  playerId: string;
  player: PlayerProfile | null;
  unplayed: MapRecommendation[];
  improvements: MapRecommendation[];
  phase: AnalysisPhase;
  completedPlayers: number;
  totalPlayers: number;
  checkedMaps: number;
  totalMaps: number;
  failedPlayers: number;
  failedMaps: number;
  error: string | null;
  /** スコアを取得できた近傍候補プレイヤーの人数。 */
  neighbourCount: number;
  /** 類似度が閾値を超えたプレイヤーの人数。 */
  similarPlayerCount: number;
  /** 協調推薦（ゴール B）が有効か。近傍不足時は false になり劣化を明示する。 */
  collaborativeReady: boolean;
  /** この分析で発行した API 呼び出し回数の概数（開発用計測）。 */
  apiCallCount: number;
}

/** 自分の履歴の取得範囲（DESIGN.md §3.3: top 50 から top 100 + recent 100 へ拡大）。 */
const OWN_SCORE_LIMIT = 100;
/** co-play シーディングに使う主戦場譜面の数（DESIGN.md §3.2.1）。 */
const SEED_MAP_COUNT = 15;
/** 近傍候補としてスコアを取得する人数の上限（DESIGN.md §3.4）。 */
const MAX_NEIGHBOUR_CANDIDATES = 40;
/** 類似プレイヤーとして採用する人数の上限（DESIGN.md §3.2.2）。 */
const MAX_NEIGHBOURS = 30;
/** 類似プレイヤーとみなす類似度の下限（DESIGN.md §3.2.2）。 */
const MIN_SIMILARITY = 0.15;
/** 協調推薦を有効化するために必要な類似プレイヤー数（DESIGN.md §3.2.3）。 */
const MIN_COLLABORATIVE_NEIGHBOURS = 10;
/** 近傍候補に残す総 PP 比の帯（DESIGN.md §3.2.1 の [0.75, 1.35] を候補不足対策で緩和）。 */
const PP_RATIO_MIN = 0.6;
const PP_RATIO_MAX = 1.6;
/** 未プレイ確定の hash 確認を行う候補数（LCB 枠 + 挑戦枠、DESIGN.md §3.3）。 */
const MAX_HASH_CHECKS = 30;
const CHALLENGE_HASH_CHECKS = 6;
/** 推薦リストの最大件数。 */
const MAX_RECOMMENDATIONS = 50;
/** API 呼び出し回数のハード上限（DESIGN.md §3.4）。 */
const HARD_API_BUDGET = 150;
/** LCB の分位点（片側80%の下側信頼限界、DESIGN.md §3.1.5）。 */
const LCB_QUANTILE = 0.2;

const EMPTY_STATE: MapRecommendationsState = {
  playerId: "",
  player: null,
  unplayed: [],
  improvements: [],
  phase: "idle",
  completedPlayers: 0,
  totalPlayers: 0,
  checkedMaps: 0,
  totalMaps: 0,
  failedPlayers: 0,
  failedMaps: 0,
  error: null,
  neighbourCount: 0,
  similarPlayerCount: 0,
  collaborativeReady: false,
  apiCallCount: 0,
};

const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
) => {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
};

/** スコア履歴を精度カーブ推定用の観測に変換する（stars>0 のみ）。 */
const toObservations = (entries: PlayerScoreEntry[]): AccuracyObservation[] =>
  entries
    .filter((entry) => entry.leaderboard.realm.stars > 0)
    .map((entry) => ({
      stars: entry.leaderboard.realm.stars,
      accuracy: entry.score.accuracy,
      characteristic: entry.leaderboard.difficulty.gameMode,
      createdAt: entry.score.createdAt,
    }));

/** スコア履歴を類似度計算用の要約に変換する。 */
const toSummaries = (entries: PlayerScoreEntry[]): PlayerScoreSummary[] =>
  entries.map((entry) => ({
    leaderboardId: entry.leaderboard.id,
    accuracy: entry.score.accuracy,
    pp: entry.score.pp,
    stars: entry.leaderboard.realm.stars,
    characteristic: entry.leaderboard.difficulty.gameMode,
  }));

interface NeighbourProfile {
  id: string;
  name: string;
  rank: number;
  entries: PlayerScoreEntry[];
  summaries: PlayerScoreSummary[];
  curve: AccuracyCurve;
  similarity: number;
}

interface MapAggregate {
  leaderboard: Leaderboard;
  players: Set<string>;
  competitor: MapRecommendation["competitor"];
  /** 類似プレイヤーによるこの譜面のスコア（CF 輸送・残差計算用）。 */
  similarScores: Array<{ profile: NeighbourProfile; score: Score }>;
}

interface EvaluatedCandidate {
  recommendation: MapRecommendation;
  /** 並び順スコア（LCB ベース、ゲート適用後）。 */
  rankScore: number;
  expectedDeltaPp: number;
}

const mmrKey = (item: EvaluatedCandidate) => ({
  songId: item.recommendation.leaderboard.map.id,
  mapper: item.recommendation.leaderboard.map.levelAuthorName,
  characteristic: item.recommendation.leaderboard.difficulty.gameMode,
  stars: item.recommendation.leaderboard.realm.stars,
});

export const useMapRecommendations = (playerId: string) => {
  const { playerRepository, playerScoreRepository, leaderboardRepository } =
    useScoreSaber();
  const getPlayer = playerRepository.getPlayer;
  const getPlayersAroundRank = playerRepository.getPlayersAroundRank;
  const getPlayerScores = playerScoreRepository.getPlayerScores;
  const getTopScores = playerScoreRepository.getTopScores;
  const getScoreByHash = playerScoreRepository.getScoreByHash;
  const getLeaderboardScores = leaderboardRepository.getLeaderboardScores;
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    const id = playerId.trim();
    let cancelled = false;

    if (!id) return;

    const run = async () => {
      if (cancelled) return;
      setState({ ...EMPTY_STATE, playerId: id, phase: "player" });

      // API 呼び出し回数の概数（getPlayersAroundRank はページ数分を数える）。
      let apiCalls = 0;
      const countCalls = (n = 1) => {
        apiCalls += n;
      };

      try {
        // ---- 1. 自分の情報と履歴（top 100 + recent 100）を取得する ----
        const [player, topScores, recentScores] = await Promise.all([
          getPlayer(id),
          getPlayerScores(id, { sort: "top", limit: OWN_SCORE_LIMIT }),
          getPlayerScores(id, { sort: "recent", limit: OWN_SCORE_LIMIT }),
        ]);
        countCalls(3);
        if (cancelled) return;

        // top と recent を leaderboard 単位で統合し、PP の高い方を自分のベストとする。
        const ownEntryByMap = new Map<number, PlayerScoreEntry>();
        for (const entry of [...recentScores.data, ...topScores.data]) {
          const current = ownEntryByMap.get(entry.leaderboard.id);
          if (!current || entry.score.pp > current.score.pp) {
            ownEntryByMap.set(entry.leaderboard.id, entry);
          }
        }
        const ownEntries = [...ownEntryByMap.values()];
        const myScores = new Map<number, Score>(
          ownEntries.map((entry) => [entry.leaderboard.id, entry.score]),
        );
        // 総 PP プロフィール列（raw PP 降順）。重み計算の基礎になる（§3.1.4）。
        const profilePps = topScores.data
          .map((entry) => entry.score.pp)
          .filter((pp) => pp > 0)
          .sort((a, b) => b - a);
        const ownSummaries = toSummaries(ownEntries);
        let ownCurve = fitAccuracyCurve(toObservations(ownEntries), {
          averageAccuracy: player.stats.averageAccuracy,
        });

        setState((current) => ({ ...current, player, phase: "players" }));

        // ---- 2. 近傍候補の収集（co-play シーディング + ランク近傍） ----
        // 自分の主戦場譜面のリーダーボードで、自分の順位付近や上位に
        // 繰り返し現れるプレイヤーを種として数える（§3.2.1）。
        const seedCounts = new Map<string, number>();
        const seedMaps = [...topScores.data]
          .sort((a, b) => b.score.pp - a.score.pp)
          .slice(0, SEED_MAP_COUNT);
        await mapWithConcurrency(seedMaps, 4, async (entry) => {
          if (cancelled || apiCalls >= HARD_API_BUDGET) return;
          try {
            countCalls();
            const response = await getLeaderboardScores(entry.leaderboard.id, {
              page: 1,
              limit: 100,
            });
            const ownRank = response.data.find(
              (score) => score.player.id === player.id,
            )?.rank;
            for (const score of response.data) {
              if (score.player.id === player.id) continue;
              const nearOwnRank =
                ownRank !== undefined && Math.abs(score.rank - ownRank) <= 10;
              const inTop = score.rank <= 10;
              if (nearOwnRank || inTop) {
                seedCounts.set(
                  score.player.id,
                  (seedCounts.get(score.player.id) ?? 0) + 1,
                );
              }
            }
          } catch {
            // 種まきは補助情報であり、失敗しても分析は継続できる。
          }
        });
        if (cancelled) return;

        countCalls(2);
        const around = await getPlayersAroundRank(player.stats.rank, 100);
        if (cancelled) return;

        const myTotalPp = player.stats.totalPP;
        const candidates = around
          .filter((nearbyPlayer) => nearbyPlayer.id !== player.id)
          .filter((nearbyPlayer) => {
            if (myTotalPp <= 0) return true;
            const ratio = nearbyPlayer.stats.totalPP / myTotalPp;
            return ratio >= PP_RATIO_MIN && ratio <= PP_RATIO_MAX;
          })
          .sort((a, b) => {
            const seedDiff =
              (seedCounts.get(b.id) ?? 0) - (seedCounts.get(a.id) ?? 0);
            if (seedDiff !== 0) return seedDiff;
            return (
              Math.abs(a.stats.rank - player.stats.rank) -
              Math.abs(b.stats.rank - player.stats.rank)
            );
          })
          .slice(0, MAX_NEIGHBOUR_CANDIDATES);

        setState((current) => ({
          ...current,
          phase: "scores",
          totalPlayers: candidates.length,
        }));

        // ---- 3. 近傍候補の top 100 を取得する（永続キャッシュ併用） ----
        const fetched: NeighbourProfile[] = [];
        let failedPlayers = 0;
        await mapWithConcurrency(candidates, 6, async (candidate) => {
          if (cancelled) return;
          try {
            const cacheKey = `neighbour-scores-v1:${candidate.id}`;
            let entries =
              await getPersistentCache<PlayerScoreEntry[]>(cacheKey);
            if (!entries) {
              if (apiCalls >= HARD_API_BUDGET) return;
              countCalls();
              const response = await getTopScores(candidate.id, 100);
              entries = response.data;
              await setPersistentCache(
                cacheKey,
                entries,
                NEIGHBOUR_CACHE_TTL_MS,
              );
            }
            if (cancelled) return;
            fetched.push({
              id: candidate.id,
              name: candidate.name,
              rank: candidate.stats.rank,
              entries,
              summaries: toSummaries(entries),
              curve: fitAccuracyCurve(toObservations(entries)),
              similarity: 0,
            });
          } catch {
            failedPlayers += 1;
          } finally {
            if (!cancelled) {
              setState((current) => ({
                ...current,
                completedPlayers: current.completedPlayers + 1,
                failedPlayers,
              }));
            }
          }
        });
        if (cancelled) return;

        // ---- 4. 類似度・母集団事前分布・PP カーブを構築する ----
        const mapMedians = computeMapMedianAccuracies([
          ownSummaries,
          ...fetched.map((profile) => profile.summaries),
        ]);
        for (const profile of fetched) {
          profile.similarity = computeSimilarity(
            ownSummaries,
            profile.summaries,
            mapMedians,
          ).similarity;
        }
        const neighbours = fetched
          .filter((profile) => profile.similarity >= MIN_SIMILARITY)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, MAX_NEIGHBOURS);
        const collaborativeReady =
          neighbours.length >= MIN_COLLABORATIVE_NEIGHBOURS;

        // 母集団事前分布のセッション内推定（Phase 3）:
        // 類似プレイヤーのカーブの平均を事前分布として自分のカーブを再推定する。
        if (neighbours.length >= 5) {
          const prior = {
            alpha:
              neighbours.reduce((sum, p) => sum + p.curve.alpha, 0) /
              neighbours.length,
            beta:
              neighbours.reduce((sum, p) => sum + p.curve.beta, 0) /
              neighbours.length,
            gamma:
              neighbours.reduce((sum, p) => sum + p.curve.gamma, 0) /
              neighbours.length,
          };
          ownCurve = fitAccuracyCurve(toObservations(ownEntries), {
            prior,
            averageAccuracy: player.stats.averageAccuracy,
          });
        }

        // PP カーブは自分 + 取得できた近傍全員の実スコアで自己校正する（§3.1.2）。
        const ppSamples = [...ownEntries, ...fetched.flatMap((p) => p.entries)]
          .filter((entry) => entry.leaderboard.realm.stars > 0)
          .map((entry) => ({
            accuracy: entry.score.accuracy,
            pp: entry.score.pp,
            stars: entry.leaderboard.realm.stars,
          }));
        const ppCurve: PpCurve = fitPpCurve(ppSamples);

        // 譜面ごとの集計（出現人数・競合者最高・類似プレイヤーのスコア）。
        const neighbourById = new Map(
          neighbours.map((profile) => [profile.id, profile]),
        );
        const mapAggregates = new Map<number, MapAggregate>();
        for (const profile of fetched) {
          for (const entry of profile.entries) {
            const leaderboardId = entry.leaderboard.id;
            let aggregate = mapAggregates.get(leaderboardId);
            if (!aggregate) {
              aggregate = {
                leaderboard: entry.leaderboard,
                players: new Set(),
                competitor: {
                  id: profile.id,
                  name: profile.name,
                  rank: profile.rank,
                  score: entry.score,
                },
                similarScores: [],
              };
              mapAggregates.set(leaderboardId, aggregate);
            }
            aggregate.players.add(profile.id);
            if (
              entry.score.modifiedScore >
              aggregate.competitor.score.modifiedScore
            ) {
              aggregate.competitor = {
                id: profile.id,
                name: profile.name,
                rank: profile.rank,
                score: entry.score,
              };
            }
            const neighbour = neighbourById.get(profile.id);
            if (neighbour) {
              aggregate.similarScores.push({
                profile: neighbour,
                score: entry.score,
              });
            }
          }
        }

        // 譜面ごとの難易度残差 ε_m（§3.1.3）: 類似プレイヤーの実精度と
        // その人のカーブ予測との差の中央値。追加の API 呼び出しは行わない。
        const residualByMap = new Map<number, number>();
        for (const [leaderboardId, aggregate] of mapAggregates) {
          if (aggregate.similarScores.length < 3) continue;
          const stars = aggregate.leaderboard.realm.stars;
          const characteristic =
            aggregate.leaderboard.difficulty.gameMode;
          residualByMap.set(
            leaderboardId,
            computeMapResidual(
              aggregate.similarScores.map(({ profile, score }) => ({
                observedAccuracy: normaliseAccuracy(score.accuracy),
                predictedAccuracy: profile.curve.predictAccuracy(
                  stars,
                  characteristic,
                ),
              })),
            ),
          );
        }

        // 候補評価の共通処理（§3.1.4–3.1.5, §3.2.3）。
        const evaluate = (
          aggregate: MapAggregate,
          myScore: Score | null,
        ): EvaluatedCandidate | null => {
          const { leaderboard } = aggregate;
          const stars = leaderboard.realm.stars;
          if (stars <= 0) return null;
          const characteristic = leaderboard.difficulty.gameMode;
          const residual = residualByMap.get(leaderboard.id) ?? 0;

          const curveAcc = ownCurve.predictAccuracy(stars, characteristic);
          const curveLcb = ownCurve.predictAccuracyLcb(
            stars,
            characteristic,
            LCB_QUANTILE,
          );
          let predictedAcc = curveAcc + residual;
          let lcbAcc = curveLcb + residual;
          let similarPlayerCount = 0;

          // 協調フィルタリング: 類似プレイヤーの実績を自分のカーブ上に輸送し、
          // 逆分散に近い重みでブレンドする（§3.2.3）。
          if (collaborativeReady && aggregate.similarScores.length > 0) {
            const transported = transportAccuracy(
              aggregate.similarScores.map(({ profile, score }) => ({
                neighbourAccuracy: normaliseAccuracy(score.accuracy),
                neighbourPredicted: profile.curve.predictAccuracy(
                  stars,
                  characteristic,
                ),
                similarity: profile.similarity,
              })),
              curveAcc,
            );
            if (transported !== null) {
              similarPlayerCount = aggregate.similarScores.length;
              const cfWeight = Math.min(2, similarPlayerCount * 0.5);
              predictedAcc =
                (predictedAcc + cfWeight * (transported + residual)) /
                (1 + cfWeight);
              lcbAcc =
                (lcbAcc + cfWeight * (transported + residual - 0.015)) /
                (1 + cfWeight);
            }
          }

          predictedAcc = Math.min(0.999, Math.max(0.3, predictedAcc));
          lcbAcc = Math.min(predictedAcc, Math.max(0.3, lcbAcc));

          const predictedPp = ppCurve.predictPp(stars, predictedAcc);
          const lcbPp = ppCurve.predictPp(stars, lcbAcc);
          const replacedPp = myScore ? myScore.pp : undefined;
          const expectedDeltaPp = deltaPpForScore(
            profilePps,
            predictedPp,
            replacedPp,
          );
          const lcbDeltaPp = deltaPpForScore(profilePps, lcbPp, replacedPp);
          // クリア可能性ゲート（§3.1.5）。プレイ済み譜面には適用しない。
          const gate = myScore ? 1 : ownCurve.clearability(stars);
          const highVariance =
            ownCurve.isLowConfidence(stars) ||
            expectedDeltaPp - lcbDeltaPp >
              Math.max(2, 0.5 * Math.max(0, expectedDeltaPp));

          return {
            recommendation: {
              leaderboard,
              kind: myScore ? "IMPROVEMENT" : "UNPLAYED",
              appearanceCount: aggregate.players.size,
              competitor: aggregate.competitor,
              myScore,
              prediction: {
                predictedAccuracy: predictedAcc,
                predictedPp,
                expectedDeltaPp,
                lcbDeltaPp,
                highVariance,
                sources: myScore
                  ? ["UPDATE"]
                  : similarPlayerCount > 0
                    ? ["SIMILAR"]
                    : [],
                similarPlayerCount,
              },
            },
            rankScore: lcbDeltaPp * gate,
            expectedDeltaPp,
          };
        };

        // ---- 5. 更新候補（自分のプレイ済み譜面）を評価する ----
        const improvements: EvaluatedCandidate[] = [];
        for (const entry of ownEntries) {
          const aggregate = mapAggregates.get(entry.leaderboard.id) ?? {
            leaderboard: entry.leaderboard,
            players: new Set<string>(),
            competitor: {
              id: player.id,
              name: player.name,
              rank: player.stats.rank,
              score: entry.score,
            },
            similarScores: [],
          };
          const evaluated = evaluate(aggregate, entry.score);
          if (evaluated && evaluated.recommendation.prediction) {
            if (evaluated.recommendation.prediction.lcbDeltaPp > 0) {
              improvements.push(evaluated);
            }
          }
        }

        // ---- 6. 未プレイ候補を事前評価し、hash 確認対象を絞る ----
        const unplayedPre: EvaluatedCandidate[] = [];
        for (const aggregate of mapAggregates.values()) {
          if (myScores.has(aggregate.leaderboard.id)) continue;
          const stars = aggregate.leaderboard.realm.stars;
          // ゴール A 単独では検証不能な外挿を出さない（§3.1.5）。
          // 類似プレイヤーの実績が十分ある譜面はゲート付きで許可する。
          const beyondReach = stars > ownCurve.maxClearedStars + 2;
          if (beyondReach && aggregate.similarScores.length < 3) continue;
          const evaluated = evaluate(aggregate, null);
          if (evaluated && evaluated.recommendation.prediction) {
            if (evaluated.recommendation.prediction.lcbDeltaPp > 0) {
              unplayedPre.push(evaluated);
            }
          }
        }
        const byRank = [...unplayedPre].sort(
          (a, b) =>
            b.rankScore - a.rankScore ||
            b.recommendation.competitor.score.pp -
              a.recommendation.competitor.score.pp,
        );
        const mainPicks = byRank.slice(
          0,
          MAX_HASH_CHECKS - CHALLENGE_HASH_CHECKS,
        );
        // 挑戦枠: LCB では届かないが期待値の高い候補を q=0.10 相当で拾う（§3.7）。
        const challengePicks = byRank
          .slice(MAX_HASH_CHECKS - CHALLENGE_HASH_CHECKS)
          .filter((candidate) => candidate.expectedDeltaPp > 0)
          .sort((a, b) => b.expectedDeltaPp - a.expectedDeltaPp)
          .slice(0, CHALLENGE_HASH_CHECKS)
          .map((candidate) => {
            if (candidate.recommendation.prediction) {
              candidate.recommendation.prediction.sources = [
                ...candidate.recommendation.prediction.sources,
                "CHALLENGE",
              ];
            }
            return candidate;
          });
        const hashTargets = [...mainPicks, ...challengePicks];

        setState((current) => ({
          ...current,
          phase: "maps",
          totalMaps: hashTargets.length,
          neighbourCount: fetched.length,
          similarPlayerCount: neighbours.length,
          collaborativeReady,
          apiCallCount: apiCalls,
        }));

        // ---- 7. 未プレイを hash で確定する（404 = 未プレイ） ----
        const unplayed: EvaluatedCandidate[] = [];
        let failedMaps = 0;
        await mapWithConcurrency(hashTargets, 6, async (candidate) => {
          if (cancelled) return;
          try {
            countCalls();
            const actualScore = await getScoreByHash(
              id,
              candidate.recommendation.leaderboard.map.hash,
              candidate.recommendation.leaderboard.difficulty.gameMode,
              candidate.recommendation.leaderboard.difficulty.difficulty,
            );
            if (cancelled) return;
            if (actualScore === null) {
              unplayed.push(candidate);
            } else {
              // top/recent の範囲外でプレイ済みだった譜面は更新候補として再評価する。
              const aggregate = mapAggregates.get(
                candidate.recommendation.leaderboard.id,
              );
              if (aggregate) {
                const evaluated = evaluate(aggregate, actualScore);
                if (
                  evaluated &&
                  evaluated.recommendation.prediction &&
                  evaluated.recommendation.prediction.lcbDeltaPp > 0
                ) {
                  improvements.push(evaluated);
                }
              }
            }
          } catch {
            failedMaps += 1;
          } finally {
            if (!cancelled) {
              setState((current) => ({
                ...current,
                checkedMaps: current.checkedMaps + 1,
                failedMaps,
              }));
            }
          }
        });
        if (cancelled) return;

        // ---- 8. 多様性再ランキング（MMR, §3.2.3）して確定する ----
        const finalImprovements = mmrRerank(improvements, {
          lambda: 0.3,
          limit: MAX_RECOMMENDATIONS,
          key: mmrKey,
          score: (item) => Math.max(0, item.rankScore),
        }).map((item) => item.recommendation);
        const finalUnplayed = mmrRerank(unplayed, {
          lambda: 0.3,
          limit: MAX_RECOMMENDATIONS,
          key: mmrKey,
          score: (item) => Math.max(0, item.rankScore),
        }).map((item) => item.recommendation);

        setState((current) => ({
          ...current,
          improvements: finalImprovements,
          unplayed: finalUnplayed,
          phase: "done",
          apiCallCount: apiCalls,
        }));
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            phase: "error",
            error:
              "ScoreSaberからプレイヤー情報を取得できませんでした。時間をおいて再度お試しください。",
          }));
        }
      }
    };

    void Promise.resolve().then(run);
    return () => {
      cancelled = true;
    };
  }, [
    getLeaderboardScores,
    getPlayer,
    getPlayerScores,
    getPlayersAroundRank,
    getScoreByHash,
    getTopScores,
    playerId,
  ]);

  const visibleState =
    state.playerId === playerId.trim() ? state : EMPTY_STATE;

  return {
    ...visibleState,
    isLoading:
      visibleState.phase !== "idle" &&
      visibleState.phase !== "done" &&
      visibleState.phase !== "error",
  };
};
