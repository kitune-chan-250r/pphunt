import axios from "axios";
import { useCallback, useEffect, useState } from "react";
import { useDebouncedCallback, type DebouncedState } from "use-debounce";
import type {
  Player,
  PlayerSearchResultResponse,
} from "../types/PlayerSearchResult";

interface ScoreSaberInterface {
  playerSearchResults: Player[];
  playerSearchString: string;
  searchPlayerWithDebounce: DebouncedState<(value: string) => void>;
  handlePlayerSearchStringChange: (searchString: string) => void;
}

export const useScoreSaber = (): ScoreSaberInterface => {
  const BASE_URL = "https://scoresaber.com";
  const [playerSearchString, setPlayerSearchString] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);

  const handlePlayerSearchStringChange = (searchString: string) => {
    setPlayerSearchString(searchString);
  };

  const searchPlayerWithDebounce = useDebouncedCallback(
    (value: string) => {
      console.info(`[useScoreSaber] debounced search string: {${value}}`);
      // 3文字以下は検索しない
      if (value.length < 3) {
        return;
      }

      const searchUrl = `${BASE_URL}/api/v2/players?search=${value}&limit=10`;
      const response = axios.get(searchUrl);
      response
        .then((res) => {
          const data = res.data as PlayerSearchResultResponse;
          console.info(data);
          setPlayerSearchResults(data.data);
        })
        .catch((err) => {
          console.error(err);
        });
    },
    350,
    { maxWait: 2000 },
  );

  // const test = useCallback(async () => {
  //   const res = await axios.get<string>(`${BASE_URL}/api/v2/leaderboards`);
  //   const data = res.data;
  //   console.info(data);
  // }, []);

  // useEffect(() => {
  //   void (async () => {
  //     await test();
  //   })();
  // }, []);

  return {
    playerSearchResults,
    playerSearchString,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
  };
};
