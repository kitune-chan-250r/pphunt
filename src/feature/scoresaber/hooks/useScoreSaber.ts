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

const client = createScoreSaberClient();

/**
 * Data-access layer for ScoreSaber API v2.
 * A single app-wide client shares its cache and request pacing across callers.
 */
export const useScoreSaber = (): ScoreSaberInterface => {
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
