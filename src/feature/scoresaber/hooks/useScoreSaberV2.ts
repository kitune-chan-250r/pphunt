import axios from "axios";
import { useCallback, useRef, useState } from "react";
import { useDebouncedCallback, type DebouncedState } from "use-debounce";
import type {
  Player,
  PlayerSearchResultResponse,
} from "../types/PlayerSearchResult";

const BASE_URL = "https://scoresaber.com";
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;
const MAX_WAIT_MS = 2000;

export interface ScoreSaberV2Interface {
  playerSearchResults: Player[];
  playerSearchString: string;
  isSearching: boolean;
  searchPlayerWithDebounce: DebouncedState<(value: string) => void>;
  handlePlayerSearchStringChange: (searchString: string) => void;
  resetSearch: () => void;
}

/**
 * Redesigned data layer for the same ScoreSaber autocomplete feature.
 * Adds request sequencing so out-of-order responses cannot overwrite newer
 * results, and exposes loading state for the new UI.
 */
export const useScoreSaberV2 = (): ScoreSaberV2Interface => {
  const [playerSearchString, setPlayerSearchString] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestSeq = useRef(0);

  const handlePlayerSearchStringChange = useCallback((searchString: string) => {
    setPlayerSearchString(searchString);
  }, []);

  const resetSearch = useCallback(() => {
    requestSeq.current += 1;
    setPlayerSearchResults([]);
    setIsSearching(false);
  }, []);

  const searchPlayerWithDebounce = useDebouncedCallback(
    (value: string) => {
      if (value.length < MIN_QUERY_LENGTH) {
        return;
      }

      const seq = ++requestSeq.current;
      setIsSearching(true);

      const searchUrl = `${BASE_URL}/api/v2/players?search=${encodeURIComponent(value)}&limit=10`;

      axios
        .get(searchUrl)
        .then((res) => {
          if (seq !== requestSeq.current) return; // stale response
          const data = res.data as PlayerSearchResultResponse;
          setPlayerSearchResults(data.data);
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          console.error(err);
          setPlayerSearchResults([]);
        })
        .finally(() => {
          if (seq === requestSeq.current) setIsSearching(false);
        });
    },
    DEBOUNCE_MS,
    { maxWait: MAX_WAIT_MS },
  );

  return {
    playerSearchResults,
    playerSearchString,
    isSearching,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
    resetSearch,
  };
};
