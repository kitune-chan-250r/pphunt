import { useMemo } from "react";
import { createScoreSaberClient } from "./scoreSaberClient";
import { usePlayerRepository } from "./usePlayerRepository";
import { usePlayerScoreRepository } from "./usePlayerScoreRepository";
import { useLeaderboardRepository } from "./useLeaderboardRepository";
import type { Player } from "../types/PlayerSearchResult";

export interface ScoreSaberInterface {
  /** Kept for existing callers: thin wrapper over the player repository. */
  searchPlayers: (searchString: string) => Promise<Player[]>;
  playerRepository: ReturnType<typeof usePlayerRepository>;
  playerScoreRepository: ReturnType<typeof usePlayerScoreRepository>;
  leaderboardRepository: ReturnType<typeof useLeaderboardRepository>;
}

/**
 * Data-access layer for ScoreSaber API v2.
 * A single shared client per hook instance means responses are cached and
 * requests go through a small concurrency window instead of firing in bulk.
 */
export const useScoreSaber = (): ScoreSaberInterface => {
  const client = useMemo(() => createScoreSaberClient({ concurrency: 6 }), []);

  const playerRepository = usePlayerRepository(client);
  const playerScoreRepository = usePlayerScoreRepository(client);
  const leaderboardRepository = useLeaderboardRepository(client);

  return {
    searchPlayers: (searchString: string) =>
      playerRepository.searchPlayers(searchString),
    playerRepository,
    playerScoreRepository,
    leaderboardRepository,
  };
};
