import { useEffect, useState } from "react";
import { useScoreSaber } from "../../scoresaber/hooks/useScoreSaber";
import type {
  Leaderboard,
  PlayerProfile,
  Score,
} from "../../scoresaber/types/ScoreSaber";

export type RecommendationKind = "UNPLAYED" | "IMPROVEMENT";

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
}

interface CompetitorMap {
  leaderboard: Leaderboard;
  players: Set<string>;
  competitor: MapRecommendation["competitor"];
}

const MAX_RECOMMENDATIONS = 50;

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
};

const compareByAppearance = (
  left: MapRecommendation,
  right: MapRecommendation,
) =>
  right.appearanceCount - left.appearanceCount ||
  right.competitor.score.pp - left.competitor.score.pp;

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
  const {
    playerRepository,
    playerScoreRepository,
  } = useScoreSaber();
  const getPlayer = playerRepository.getPlayer;
  const getPlayersAroundRank = playerRepository.getPlayersAroundRank;
  const getTopScores = playerScoreRepository.getTopScores;
  const getScoreByHash = playerScoreRepository.getScoreByHash;
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    const id = playerId.trim();
    let cancelled = false;

    if (!id) return;

    const run = async () => {
      if (cancelled) return;
      setState({ ...EMPTY_STATE, playerId: id, phase: "player" });

      try {
        const [player, myTopScores] = await Promise.all([
          getPlayer(id),
          getTopScores(id, 50),
        ]);
        if (cancelled) return;

        const myScores = new Map<number, Score>(
          myTopScores.data.map((entry) => [
            entry.leaderboard.id,
            entry.score,
          ]),
        );
        setState((current) => ({ ...current, player, phase: "players" }));

        const around = await getPlayersAroundRank(player.stats.rank, 100);
        if (cancelled) return;

        // 周辺順位のAPI結果に対象者自身が含まれる場合は除き、比較対象を200人に揃える。
        const competitors = around
          .filter((nearbyPlayer) => nearbyPlayer.id !== player.id)
          .slice(0, 200);
        const competitorMaps = new Map<number, CompetitorMap>();

        setState((current) => ({
          ...current,
          phase: "scores",
          totalPlayers: competitors.length,
        }));

        await mapWithConcurrency(competitors, 6, async (nearbyPlayer) => {
          if (cancelled) return;

          try {
            const response = await getTopScores(nearbyPlayer.id, 50);
            if (cancelled) return;

            for (const entry of response.data) {
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
                });
              } else {
                currentBest.players.add(nearbyPlayer.id);
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
                  competitor: map.competitor,
                  myScore,
                });
              }
            }

            setState((current) => ({
              ...current,
              improvements: improvements
                .sort(compareByAppearance)
                .slice(0, MAX_RECOMMENDATIONS),
              completedPlayers: current.completedPlayers + 1,
            }));
          } catch {
            if (!cancelled) {
              setState((current) => ({
                ...current,
                completedPlayers: current.completedPlayers + 1,
                failedPlayers: current.failedPlayers + 1,
              }));
            }
          }
        });

        if (cancelled) return;

        const ppThreshold = player.stats.plusOnePP;
        // 出現頻度の高い候補に絞り、個別のプレイ状況確認を最大50譜面に抑える。
        const mapCandidates = [...competitorMaps.values()]
          .filter(({ leaderboard }) => !myScores.has(leaderboard.id))
          .sort((left, right) => {
            const countDifference =
              right.players.size - left.players.size;
            return (
              countDifference ||
              right.competitor.score.pp - left.competitor.score.pp
            );
          })
          .slice(0, MAX_RECOMMENDATIONS);

        setState((current) => ({
          ...current,
          phase: "maps",
          totalMaps: mapCandidates.length,
        }));

        const unplayed: MapRecommendation[] = [];
        const newlyFoundImprovements: MapRecommendation[] = [];
        let failedMaps = 0;

        await mapWithConcurrency(mapCandidates, 6, async (candidate) => {
          if (cancelled) return;

          try {
            const actualScore = await getScoreByHash(
              id,
              candidate.leaderboard.map.hash,
              candidate.leaderboard.difficulty.gameMode,
              candidate.leaderboard.difficulty.difficulty,
            );
            if (cancelled) return;

            if (actualScore === null) {
              if (
                ppThreshold !== null &&
                candidate.competitor.score.pp >= ppThreshold
              ) {
                unplayed.push({
                  leaderboard: candidate.leaderboard,
                  kind: "UNPLAYED",
                  appearanceCount: candidate.players.size,
                  competitor: candidate.competitor,
                  myScore: null,
                });
                unplayed.sort(compareByAppearance);
              }
            } else if (
              candidate.competitor.score.modifiedScore >
              actualScore.modifiedScore
            ) {
              newlyFoundImprovements.push({
                leaderboard: candidate.leaderboard,
                kind: "IMPROVEMENT",
                appearanceCount: candidate.players.size,
                competitor: candidate.competitor,
                myScore: actualScore,
              });
              newlyFoundImprovements.sort(compareByAppearance);
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
                  .sort(compareByAppearance)
                  .slice(0, MAX_RECOMMENDATIONS),
                checkedMaps: current.checkedMaps + 1,
                failedMaps,
              }));
            }
          }
        });

        if (!cancelled) {
          setState((current) => ({ ...current, phase: "done" }));
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
