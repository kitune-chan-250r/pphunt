import axios from "axios";
import { useCallback } from "react";
import type {
  Player,
  PlayerSearchResultResponse,
} from "../types/PlayerSearchResult";

const BASE_URL = "https://scoresaber.com";

export interface ScoreSaberInterface {
  searchPlayers: (searchString: string) => Promise<Player[]>;
}

export const useScoreSaber = (): ScoreSaberInterface => {
  const searchPlayers = useCallback(async (searchString: string) => {
    const searchUrl = `${BASE_URL}/api/v2/players?search=${encodeURIComponent(searchString)}&limit=10`;
    const response =
      await axios.get<PlayerSearchResultResponse>(searchUrl);

    return response.data.data;
  }, []);

  return { searchPlayers };
};
