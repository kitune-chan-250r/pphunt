import { useCallback } from "react";
import { MAX_LIMIT, createScoreSaberClient } from "./scoreSaberClient";
import type {
  Leaderboard,
  LeaderboardScoreEntry,
  PaginatedResponse,
} from "../types/ScoreSaber";

export interface LeaderboardScoresParams {
  page?: number;
  limit?: number;
  sort?: "score" | "timeSet";
  sortDirection?: "asc" | "desc";
  hideNA?: boolean;
  search?: string;
  realmId?: number;
}

export interface LeaderboardRepository {
  /** `GET /api/v2/leaderboards/{id}` — flat object, not wrapped in `data`. */
  getLeaderboard: (leaderboardId: number) => Promise<Leaderboard>;

  /** `GET /api/v2/leaderboards/hash/{hash}/{mode}/{difficulty}` */
  getLeaderboardByHash: (
    hash: string,
    gameMode: string,
    difficulty: number,
  ) => Promise<Leaderboard>;

  /** `GET /api/v2/leaderboards/{id}/scores` */
  getLeaderboardScores: (
    leaderboardId: number,
    params?: LeaderboardScoresParams,
  ) => Promise<PaginatedResponse<LeaderboardScoreEntry>>;
}

export const useLeaderboardRepository = (
  client = createScoreSaberClient(),
): LeaderboardRepository => {
  const getLeaderboard = useCallback(
    async (leaderboardId: number): Promise<Leaderboard> => {
      return client.get<Leaderboard>(
        `/api/v2/leaderboards/${encodeURIComponent(String(leaderboardId))}`,
      );
    },
    [client],
  );

  const getLeaderboardByHash = useCallback(
    async (
      hash: string,
      gameMode: string,
      difficulty: number,
    ): Promise<Leaderboard> => {
      return client.get<Leaderboard>(
        `/api/v2/leaderboards/hash/${encodeURIComponent(hash)}/` +
          `${encodeURIComponent(gameMode)}/${difficulty}`,
      );
    },
    [client],
  );

  const getLeaderboardScores = useCallback(
    async (
      leaderboardId: number,
      params: LeaderboardScoresParams = {},
    ): Promise<PaginatedResponse<LeaderboardScoreEntry>> => {
      return client.get<PaginatedResponse<LeaderboardScoreEntry>>(
        `/api/v2/leaderboards/${encodeURIComponent(String(leaderboardId))}/scores`,
        {
          page: params.page ?? 1,
          limit: params.limit ?? MAX_LIMIT,
          sort: params.sort ?? "score",
          sortDirection: params.sortDirection ?? "desc",
          ...(params.hideNA ? { hideNA: "true" } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.realmId !== undefined ? { realmId: params.realmId } : {}),
        },
      );
    },
    [client],
  );

  return { getLeaderboard, getLeaderboardByHash, getLeaderboardScores };
};
