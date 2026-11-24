import { useEffect, useState } from "react";
import { useScoreSaber } from "../../scoresaber/hooks/useScoreSaber";
import type {
  Leaderboard,
  PlayerProfile,
  PlayerScoreEntry,
  RankedPlayer,
  Score,
} from "../../scoresaber/types/ScoreSaber";
import {
  fitAccuracyCurve,
  normaliseAccuracy,
  type AccuracyObservation,
} from "../lib/accuracyCurve";
import { fitPpCurve, type PpCurve } from "../lib/ppCurve";
import { deltaPpForScore } from "../lib/ppGain";
import {
  countRecentPlayers,
  freshnessScore,
  halfLifeDaysForRank,
} from "../lib/freshness";
import { blendScores } from "../lib/blend";
import { ApiBudget, HARD_API_BUDGET } from "../lib/apiBudget";
import {
  getPersistentCache,
  setPersistentCache,
  NEIGHBOUR_CACHE_TTL_MS,
} from "../lib/cache";

export type RecommendationKind = "UNPLAYED" | "IMPROVEMENT";

/**
 * 順位付けには使わない表示専用の予測情報（DESIGN_V3.md §3.4）。
 * v2 の計算モジュールを「情報」として再利用する: 予測 +ΔPP は
 * `ppGain.ts` の正確計算、予測精度は個人の精度カーブによる目安。
 */
export interface RecommendationDisplay {
  /** 競合者最高の精度（観測値）を自分が出した場合の予測 +ΔPP。 */
  predictedDeltaPpBest: number;
  /** 競合者中央値の精度を自分が出した場合の予測 +ΔPP。 */
  predictedDeltaPpMedian: number;
  /** 個人の精度–stars カーブによる予測精度（0–1、目安）。 */
  predictedAccuracy: number;
  /** 競合者最高精度が予測精度を大きく上回る譜面（「格上」タグ）。 */
  isAboveCurve: boolean;
  /** 直近90日にこの譜面をプレイした周辺プレイヤーの人数。 */
  recentPlayerCount: number;
}

export interface MapRecommendation {
  leaderboard: Leaderboard;
  kind: RecommendationKind;
  appearanceCount: number;
  /**
   * 鮮度重み付き出現スコア（DESIGN_V3.md §3.3）。鮮度重みが無効な層
   * （ランク 1001–5000）では出現人数そのものが入る。最終的な並びは
   * Phase 2 のブレンドスコア（鮮度＋期待 ΔPP）が主軸。
   */
  freshnessScore: number;
  competitor: {
    id: string;
    name: string;
    rank: number;
    score: Score;
  };
  myScore: Score | null;
  /** 集計完了後に付与される表示専用情報。集計途中は未設定の場合がある。 */
  display?: RecommendationDisplay;
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
  /** この分析で発行した API 呼び出し回数の概数（キャッシュヒットは除く）。 */
  apiCallCount: number;
}

interface CompetitorMap {
  leaderboard: Leaderboard;
  players: Set<string>;
  competitor: MapRecommendation["competitor"];
  /** プレイヤーごとのスコア（鮮度・中央値の算出用）。 */
  scoresByPlayer: Map<string, Score>;
}

const MAX_RECOMMENDATIONS = 50;
/** 自分・近傍の取得深度（DESIGN_V3.md §3.2 P1/P2: top 100）。 */
const SCORE_LIMIT = 100;
/** 近傍の取得人数（DESIGN_V3.md §3.6: 既定60人 × top100 に組み替える）。 */
const NEIGHBOUR_LIMIT = 60;
/** 近傍フェーズで hash 確認フェーズ用に予約する呼び出し回数。 */
const HASH_CHECK_RESERVE = MAX_RECOMMENDATIONS;
/** 近傍スコアの永続キャッシュキー。 */
const NEIGHBOUR_CACHE_KEY_PREFIX = "neighbour-scores-v3:";
/** 「格上」と判定する、競合者最高精度と予測精度の差（DESIGN_V3.md §3.4）。 */
const ABOVE_CURVE_ACCURACY_GAP = 0.04;

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
  apiCallCount: 0,
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
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

export const useMapRecommendations = (playerId: string) => {
  const { playerRepository, playerScoreRepository } = useScoreSaber();
  const getPlayer = playerRepository.getPlayer;
  const getPlayersAroundRank = playerRepository.getPlayersAroundRank;
  const getTopScores = playerScoreRepository.getTopScores;
  const getPlayerScores = playerScoreRepository.getPlayerScores;
  const getScoreByHash = playerScoreRepository.getScoreByHash;
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    const id = playerId.trim();
    let cancelled = false;

    if (!id) return;

    const run = async () => {
      if (cancelled) return;
      setState({ ...EMPTY_STATE, playerId: id, phase: "player" });

      // API 呼び出し予算（DESIGN_V3.md §3.6）。キャッシュヒットは消費しない。
      const budget = new ApiBudget(HARD_API_BUDGET);
      // 鮮度重みの基準時刻は分析開始時刻で固定する。
      const referenceMs = Date.now();

      try {
        // ---- 1. 自分の情報と履歴（top 100 + recent 100）を取得する ----
        budget.tryConsume(3);
        const [player, myTopScores, myRecentScores] = await Promise.all([
          getPlayer(id),
          getTopScores(id, SCORE_LIMIT),
          getPlayerScores(id, { sort: "recent", limit: SCORE_LIMIT }),
        ]);
        if (cancelled) return;

        // top と recent を leaderboard 単位で統合し、modifiedScore の
        // 高い方を自分のベストとする（更新候補の判定基準に合わせる）。
        const myEntryByMap = new Map<number, PlayerScoreEntry>();
        for (const entry of [...myRecentScores.data, ...myTopScores.data]) {
          const current = myEntryByMap.get(entry.leaderboard.id);
          if (
            !current ||
            entry.score.modifiedScore > current.score.modifiedScore
          ) {
            myEntryByMap.set(entry.leaderboard.id, entry);
          }
        }
        const myEntries = [...myEntryByMap.values()];
        const myScores = new Map<number, Score>(
          myEntries.map((entry) => [entry.leaderboard.id, entry.score]),
        );
        // 総 PP プロフィール列（raw PP 降順）。表示用 ΔPP の基礎になる。
        const profilePps = myTopScores.data
          .map((entry) => entry.score.pp)
          .filter((pp) => pp > 0)
          .sort((a, b) => b - a);

        // 個人の精度カーブ（表示専用。順位付けには使わない）。
        const observations: AccuracyObservation[] = myEntries
          .filter((entry) => entry.leaderboard.realm.stars > 0)
          .map((entry) => ({
            stars: entry.leaderboard.realm.stars,
            accuracy: entry.score.accuracy,
            characteristic: entry.leaderboard.difficulty.gameMode,
            createdAt: entry.score.createdAt,
          }));
        const ownCurve = fitAccuracyCurve(observations, {
          averageAccuracy: player.stats.averageAccuracy,
        });
        // 鮮度重みの半減期は対象プレイヤーのランク帯で決める（§3.5）。
        const halfLifeDays = halfLifeDaysForRank(player.stats.rank);

        setState((current) => ({
          ...current,
          player,
          phase: "players",
          apiCallCount: budget.used,
        }));

        // 周辺一覧はページ数分を消費する（limit=100 で rank±100 を覆う）。
        const firstAroundPage = Math.max(
          1,
          Math.ceil(Math.max(1, player.stats.rank - 100) / 100),
        );
        const lastAroundPage = Math.ceil((player.stats.rank + 100) / 100);
        budget.tryConsume(lastAroundPage - firstAroundPage + 1);
        const around = await getPlayersAroundRank(player.stats.rank, 100);
        if (cancelled) return;

        // 周辺順位のAPI結果に対象者自身が含まれる場合は除き、
        // 人数を絞って深く取る（既定60人、DESIGN_V3.md §3.6）。
        // キャップする際はランク距離の近い順に選ぶ（片側に偏らせない）。
        const competitors = around
          .filter((nearbyPlayer) => nearbyPlayer.id !== player.id)
          .sort(
            (a, b) =>
              Math.abs(a.stats.rank - player.stats.rank) -
              Math.abs(b.stats.rank - player.stats.rank),
          )
          .slice(0, NEIGHBOUR_LIMIT);
        const competitorMaps = new Map<number, CompetitorMap>();
        // PP カーブ自己校正用のサンプル（自分 + 取得できた近傍全員）。
        const ppSamples: Array<{
          accuracy: number;
          pp: number;
          stars: number;
        }> = myEntries
          .filter((entry) => entry.leaderboard.realm.stars > 0)
          .map((entry) => ({
            accuracy: entry.score.accuracy,
            pp: entry.score.pp,
            stars: entry.leaderboard.realm.stars,
          }));

        setState((current) => ({
          ...current,
          phase: "scores",
          totalPlayers: competitors.length,
          apiCallCount: budget.used,
        }));

        const aggregateEntries = (
          nearbyPlayer: RankedPlayer,
          entries: PlayerScoreEntry[],
        ) => {
          // PP カーブのサンプルはプレイヤー×譜面で PP 最大の1件に絞る
          // （§6 ハーネスの dedupe と揃える）。
          const bestEntryByMap = new Map<number, PlayerScoreEntry>();
          for (const entry of entries) {
            const current = bestEntryByMap.get(entry.leaderboard.id);
            if (!current || entry.score.pp > current.score.pp) {
              bestEntryByMap.set(entry.leaderboard.id, entry);
            }
          }
          for (const entry of bestEntryByMap.values()) {
            if (entry.leaderboard.realm.stars > 0) {
              ppSamples.push({
                accuracy: entry.score.accuracy,
                pp: entry.score.pp,
                stars: entry.leaderboard.realm.stars,
              });
            }
          }
          for (const entry of entries) {
            const leaderboardId = entry.leaderboard.id;
            const currentBest = competitorMaps.get(leaderboardId);
            if (!currentBest) {
              competitorMaps.set(leaderboardId, {
                leaderboard: entry.leaderboard,
                players: new Set([nearbyPlayer.id]),
                competitor: {
                  id: nearbyPlayer.id,
                  name: nearbyPlayer.name,
                  rank: nearbyPlayer.stats.rank,
                  score: entry.score,
                },
                scoresByPlayer: new Map([[nearbyPlayer.id, entry.score]]),
              });
            } else {
              currentBest.players.add(nearbyPlayer.id);
              currentBest.scoresByPlayer.set(nearbyPlayer.id, entry.score);
              if (
                entry.score.modifiedScore >
                currentBest.competitor.score.modifiedScore
              ) {
                currentBest.competitor = {
                  id: nearbyPlayer.id,
                  name: nearbyPlayer.name,
                  rank: nearbyPlayer.stats.rank,
                  score: entry.score,
                };
              }
            }
          }
        };

        const playDatesOf = (map: CompetitorMap): number[] =>
          [...map.scoresByPlayer.values()]
            .map((score) => Date.parse(score.createdAt))
            .filter((ms) => Number.isFinite(ms));

        // 鮮度重みが無効な層（1001–5000）では出現人数そのものを
        // スコアとする（DESIGN_V3.md §3.5、Phase 2 確定）。
        const freshOf = (map: CompetitorMap): number =>
          halfLifeDays === null
            ? map.players.size
            : freshnessScore(playDatesOf(map), referenceMs, halfLifeDays);

        // 並び順: 鮮度重み付き出現スコア降順 → 競合者最高 PP 降順（§3.3）。
        // 集計完了後はブレンドスコアによる並びに切り替える（Phase 2）。
        const compareByFreshness = (
          left: MapRecommendation,
          right: MapRecommendation,
        ) =>
          right.freshnessScore - left.freshnessScore ||
          right.competitor.score.pp - left.competitor.score.pp;

        // ブレンドスコア（集計完了後に算出。それまでは空で鮮度順を使う）。
        const blendScoreByMap = new Map<number, number>();
        const compareByBlend = (
          left: MapRecommendation,
          right: MapRecommendation,
        ) =>
          (blendScoreByMap.get(right.leaderboard.id) ?? 0) -
            (blendScoreByMap.get(left.leaderboard.id) ?? 0) ||
          compareByFreshness(left, right);
        const compareForPhase = (
          left: MapRecommendation,
          right: MapRecommendation,
        ) =>
          blendScoreByMap.size > 0
            ? compareByBlend(left, right)
            : compareByFreshness(left, right);

        const buildImprovements = (): MapRecommendation[] => {
          const improvements: MapRecommendation[] = [];
          for (const [leaderboardId, map] of competitorMaps) {
            const myScore = myScores.get(leaderboardId);
            if (
              myScore &&
              map.competitor.score.modifiedScore > myScore.modifiedScore
            ) {
              improvements.push({
                leaderboard: map.leaderboard,
                kind: "IMPROVEMENT",
                appearanceCount: map.players.size,
                freshnessScore: freshOf(map),
                competitor: map.competitor,
                myScore,
              });
            }
          }
          return improvements;
        };

        let failedPlayers = 0;
        await mapWithConcurrency(competitors, 6, async (nearbyPlayer) => {
          if (cancelled) return;

          try {
            // 近傍スコアは IndexedDB にキャッシュし、再分析時の
            // 実呼び出しを抑える（DESIGN_V3.md §3.6、cache.ts 流用）。
            const cacheKey = `${NEIGHBOUR_CACHE_KEY_PREFIX}${nearbyPlayer.id}`;
            let entries =
              await getPersistentCache<PlayerScoreEntry[]>(cacheKey);
            if (!entries) {
              // hash 確認フェーズの分を予約し、近傍だけで予算を
              // 使い切らないようにする。予算切れの近傍は取得を諦めるが、
              // 進捗としては処理済みに数える。
              if (!budget.tryConsumeAboveReserve(1, HASH_CHECK_RESERVE)) {
                if (!cancelled) {
                  setState((current) => ({
                    ...current,
                    completedPlayers: current.completedPlayers + 1,
                  }));
                }
                return;
              }
              const response = await getTopScores(
                nearbyPlayer.id,
                SCORE_LIMIT,
              );
              entries = response.data;
              await setPersistentCache(
                cacheKey,
                entries,
                NEIGHBOUR_CACHE_TTL_MS,
              );
            }
            if (cancelled) return;

            aggregateEntries(nearbyPlayer, entries);

            setState((current) => ({
              ...current,
              improvements: buildImprovements()
                .sort(compareByFreshness)
                .slice(0, MAX_RECOMMENDATIONS),
              completedPlayers: current.completedPlayers + 1,
              apiCallCount: budget.used,
            }));
          } catch {
            failedPlayers += 1;
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

        // ---- 2. 表示専用の予測情報を付与する ----
        const ppCurve: PpCurve = fitPpCurve(ppSamples);

        // Phase 2: 鮮度スコアと期待 ΔPP のブレンドスコアを算出する
        // （DESIGN_V3.md §6 (iii) の本採用。z スコアは両タブの候補合算で
        // 計算し、§6 ハーネスと同じ定義に揃える）。期待 ΔPP の推定器も
        // ハーネスと同一（個人カーブ予測精度 → 自己校正 PP カーブ →
        // 正確 ΔPP）。以降の並びはブレンドスコアを主軸とする。
        {
          const blendInputs: Array<{
            leaderboardId: number;
            freshness: number;
            expectedDeltaPp: number;
          }> = [];
          for (const [leaderboardId, map] of competitorMaps) {
            const myScore = myScores.get(leaderboardId);
            const isImprovement =
              myScore !== undefined &&
              map.competitor.score.modifiedScore > myScore.modifiedScore;
            const isUnplayedCandidate =
              myScore === undefined &&
              player.stats.plusOnePP !== null &&
              map.competitor.score.pp >= player.stats.plusOnePP;
            if (!isImprovement && !isUnplayedCandidate) continue;
            const stars = map.leaderboard.realm.stars;
            const expectedDeltaPp = deltaPpForScore(
              profilePps,
              ppCurve.predictPp(
                stars,
                ownCurve.predictAccuracy(
                  stars,
                  map.leaderboard.difficulty.gameMode,
                ),
              ),
              myScore?.pp,
            );
            blendInputs.push({
              leaderboardId,
              freshness: freshOf(map),
              expectedDeltaPp,
            });
          }
          const scores = blendScores(blendInputs);
          blendInputs.forEach((input, index) => {
            blendScoreByMap.set(input.leaderboardId, scores[index]);
          });
        }
        const buildDisplay = (
          map: CompetitorMap,
          myScore: Score | null,
        ): RecommendationDisplay => {
          const stars = map.leaderboard.realm.stars;
          const gameMode = map.leaderboard.difficulty.gameMode;
          const accuracies = [...map.scoresByPlayer.values()].map((score) =>
            normaliseAccuracy(score.accuracy),
          );
          const bestAccuracy = normaliseAccuracy(
            map.competitor.score.accuracy,
          );
          const medianAccuracy = median(accuracies);
          const predictedAccuracy = ownCurve.predictAccuracy(stars, gameMode);
          const replacedPp = myScore?.pp;
          const deltaFor = (accuracy: number): number =>
            Math.max(
              0,
              deltaPpForScore(
                profilePps,
                ppCurve.predictPp(stars, accuracy),
                replacedPp,
              ),
            );
          return {
            predictedDeltaPpBest: deltaFor(bestAccuracy),
            predictedDeltaPpMedian: deltaFor(medianAccuracy),
            predictedAccuracy,
            isAboveCurve:
              bestAccuracy - predictedAccuracy >= ABOVE_CURVE_ACCURACY_GAP,
            recentPlayerCount: countRecentPlayers(
              playDatesOf(map),
              referenceMs,
              90,
            ),
          };
        };

        const withDisplay = (
          recommendation: MapRecommendation,
          map: CompetitorMap,
        ): MapRecommendation => ({
          ...recommendation,
          display: buildDisplay(map, recommendation.myScore),
        });

        setState((current) => ({
          ...current,
          improvements: current.improvements
            .map((recommendation) => {
              const map = competitorMaps.get(recommendation.leaderboard.id);
              return map ? withDisplay(recommendation, map) : recommendation;
            })
            .sort(compareByBlend),
          apiCallCount: budget.used,
        }));

        // ---- 3. 未プレイ候補のプレイ状況を hash で確認する ----
        const ppThreshold = player.stats.plusOnePP;
        // ブレンドスコアの高い候補に絞り、個別のプレイ状況確認を
        // 最大50譜面に抑える。
        const mapCandidates = [...competitorMaps.entries()]
          .filter(([leaderboardId]) => !myScores.has(leaderboardId))
          .map(([leaderboardId, map]) => ({
            leaderboardId,
            map,
            freshness: freshOf(map),
          }))
          .sort(
            (left, right) =>
              (blendScoreByMap.get(right.leaderboardId) ?? 0) -
                (blendScoreByMap.get(left.leaderboardId) ?? 0) ||
              right.freshness - left.freshness ||
              right.map.competitor.score.pp - left.map.competitor.score.pp,
          )
          .slice(0, MAX_RECOMMENDATIONS);

        setState((current) => ({
          ...current,
          phase: "maps",
          totalMaps: mapCandidates.length,
          apiCallCount: budget.used,
        }));

        const unplayed: MapRecommendation[] = [];
        const newlyFoundImprovements: MapRecommendation[] = [];
        let failedMaps = 0;

        await mapWithConcurrency(mapCandidates, 6, async (candidate) => {
          if (cancelled) return;

          try {
            if (!budget.tryConsume(1)) {
              // 予算切れの候補は未確認のまま残す（失敗とは数えない）。
              return;
            }
            const actualScore = await getScoreByHash(
              id,
              candidate.map.leaderboard.map.hash,
              candidate.map.leaderboard.difficulty.gameMode,
              candidate.map.leaderboard.difficulty.difficulty,
            );
            if (cancelled) return;

            if (actualScore === null) {
              if (
                ppThreshold !== null &&
                candidate.map.competitor.score.pp >= ppThreshold
              ) {
                unplayed.push(
                  withDisplay(
                    {
                      leaderboard: candidate.map.leaderboard,
                      kind: "UNPLAYED",
                      appearanceCount: candidate.map.players.size,
                      freshnessScore: candidate.freshness,
                      competitor: candidate.map.competitor,
                      myScore: null,
                    },
                    candidate.map,
                  ),
                );
                unplayed.sort(compareForPhase);
              }
            } else if (
              candidate.map.competitor.score.modifiedScore >
              actualScore.modifiedScore
            ) {
              newlyFoundImprovements.push(
                withDisplay(
                  {
                    leaderboard: candidate.map.leaderboard,
                    kind: "IMPROVEMENT",
                    appearanceCount: candidate.map.players.size,
                    freshnessScore: candidate.freshness,
                    competitor: candidate.map.competitor,
                    myScore: actualScore,
                  },
                  candidate.map,
                ),
              );
              newlyFoundImprovements.sort(compareForPhase);
            }
          } catch {
            failedMaps += 1;
          } finally {
            if (!cancelled) {
              setState((current) => ({
                ...current,
                unplayed: unplayed.slice(0, MAX_RECOMMENDATIONS),
                improvements: [
                  ...current.improvements.filter(
                    (item) =>
                      item.myScore &&
                      myScores.has(item.leaderboard.id),
                  ),
                  ...newlyFoundImprovements,
                ]
                  .sort(compareForPhase)
                  .slice(0, MAX_RECOMMENDATIONS),
                checkedMaps: current.checkedMaps + 1,
                failedMaps,
                apiCallCount: budget.used,
              }));
            }
          }
        });

        if (!cancelled) {
          setState((current) => ({
            ...current,
            phase: "done",
            apiCallCount: budget.used,
          }));
        }
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
    getPlayer,
    getPlayersAroundRank,
    getPlayerScores,
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
