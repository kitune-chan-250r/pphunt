import { useCallback } from "react";
import { createScoreSaberClient, isNotFound } from "./scoreSaberClient";
import type {
  PaginatedResponse,
  PlayerScoreEntry,
  Score,
} from "../types/ScoreSaber";

export type ScoreSort = "top" | "recent" | "oldest" | "accuracy";

export interface GetPlayerScoresParams {
  page?: number;
  limit?: number;
  sort?: ScoreSort;
  leaderboardId?: number;
  mapId?: number;
  search?: string;
  personalBest?: "all";
  realmId?: number;
}

export interface PlayerScoreRepository {
  /**
   * `GET /api/v2/players/{id}/scores` — paginated, `sort=top` by default.
   * `limit` is capped at 100 by the API.
   */
  getPlayerScores: (
    playerId: string,
    params?: GetPlayerScoresParams,
  ) => Promise<PaginatedResponse<PlayerScoreEntry>>;

  /** Convenience wrapper for a player's top N scores (`sort=top`). */
  getTopScores: (
    playerId: string,
    limit?: number,
  ) => Promise<PaginatedResponse<PlayerScoreEntry>>;

  /**
   * `GET /api/v2/players/{id}/scores/hash/{hash}/{mode}/{difficulty}` —
   * the player's score on one leaderboard. Returns `null` when the player has
   * no score there (HTTP 404), which is how "unplayed" is detected.
   */
  getScoreByHash: (
    playerId: string,
    hash: string,
    gameMode: string,
    difficulty: number,
  ) => Promise<Score | null>;
}

export const usePlayerScoreRepository = (
  client = createScoreSaberClient(),
): PlayerScoreRepository => {
  const getPlayerScores = useCallback(
    async (
      playerId: string,
      params: GetPlayerScoresParams = {},
    ): Promise<PaginatedResponse<PlayerScoreEntry>> => {
      return client.get<PaginatedResponse<PlayerScoreEntry>>(
        `/api/v2/players/${encodeURIComponent(playerId)}/scores`,
        {
          page: params.page ?? 1,
          limit: params.limit ?? 50,
          sort: params.sort ?? "top",
          ...(params.leaderboardId !== undefined
            ? { leaderboardId: params.leaderboardId }
            : {}),
          ...(params.mapId !== undefined ? { mapId: params.mapId } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.personalBest ? { personalBest: params.personalBest } : {}),
          ...(params.realmId !== undefined ? { realmId: params.realmId } : {}),
        },
      );
    },
    [client],
  );

  const getTopScores = useCallback(
    (playerId: string, limit = 50) =>
      getPlayerScores(playerId, { sort: "top", limit }),
    [getPlayerScores],
  );

  const getScoreByHash = useCallback(
    async (
      playerId: string,
      hash: string,
      gameMode: string,
      difficulty: number,
    ): Promise<Score | null> => {
      const path =
        `/api/v2/players/${encodeURIComponent(playerId)}/scores/hash/` +
        `${encodeURIComponent(hash)}/${encodeURIComponent(gameMode)}/${difficulty}`;

      try {
        return await client.get<Score>(path);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    [client],
  );

  return { getPlayerScores, getTopScores, getScoreByHash };
};
