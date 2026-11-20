import { useCallback } from "react";
import { MAX_LIMIT, createScoreSaberClient } from "./scoreSaberClient";
import type {
  PaginatedResponse,
  PlayerProfile,
  RankedPlayer,
} from "../types/ScoreSaber";

export interface PlayerRepository {
  /** `GET /api/v2/players/{id}` */
  getPlayer: (playerId: string) => Promise<PlayerProfile>;

  /**
   * `GET /api/v2/players` sorted by global rank, centred on `rank`.
   * Returns the players in `[rank - halfSpan, rank + halfSpan]`, deduplicated
   * and ordered by rank. Pages are computed from the rank because `pivot=player`
   * only centres on the *authenticated* viewer, not an arbitrary player.
   */
  getPlayersAroundRank: (
    rank: number,
    halfSpan?: number,
  ) => Promise<RankedPlayer[]>;

  /** `GET /api/v2/players?search=...` (min 3 chars) */
  searchPlayers: (
    searchString: string,
    limit?: number,
  ) => Promise<RankedPlayer[]>;
}

/** Page containing a 1-based rank when sorted ascending with `limit` items. */
const pageForRank = (rank: number, limit: number): number =>
  Math.max(1, Math.ceil(rank / limit));

export const usePlayerRepository = (
  client = createScoreSaberClient(),
): PlayerRepository => {
  const getPlayer = useCallback(
    async (playerId: string): Promise<PlayerProfile> => {
      const response = await client.get<PlayerProfile>(
        `/api/v2/players/${encodeURIComponent(playerId)}`,
      );
      return response;
    },
    [client],
  );

  const getPlayersAroundRank = useCallback(
    async (rank: number, halfSpan = 100): Promise<RankedPlayer[]> => {
      const limit = MAX_LIMIT;
      const lowRank = Math.max(1, rank - halfSpan);
      const highRank = rank + halfSpan;

      const firstPage = pageForRank(lowRank, limit);
      const lastPage = pageForRank(highRank, limit);

      const pages: RankedPlayer[] = [];
      for (let page = firstPage; page <= lastPage; page += 1) {
        const response = await client.get<PaginatedResponse<RankedPlayer>>(
          "/api/v2/players",
          { page, limit, sort: "rank", sortDirection: "asc" },
        );
        pages.push(...response.data);
      }

      const seen = new Set<string>();
      return pages
        .filter((player) => {
          if (seen.has(player.id)) return false;
          seen.add(player.id);
          return player.stats.rank >= lowRank && player.stats.rank <= highRank;
        })
        .sort((a, b) => a.stats.rank - b.stats.rank);
    },
    [client],
  );

  const searchPlayers = useCallback(
    async (searchString: string, limit = 10): Promise<RankedPlayer[]> => {
      const response = await client.get<PaginatedResponse<RankedPlayer>>(
        "/api/v2/players",
        { search: searchString, limit },
      );
      return response.data;
    },
    [client],
  );

  return { getPlayer, getPlayersAroundRank, searchPlayers };
};
