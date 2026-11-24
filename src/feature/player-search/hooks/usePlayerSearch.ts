import { useCallback, useRef, useState } from "react";
import { useDebouncedCallback, type DebouncedState } from "use-debounce";
import { useScoreSaber } from "../../scoresaber/hooks/useScoreSaber";
import type { Player } from "../../scoresaber/types/PlayerSearchResult";
import { ensureFlagIconsCss } from "../flagIconsCss";

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 350;
const MAX_WAIT_MS = 2000;

export interface PlayerSearchInterface {
  playerSearchResults: Player[];
  playerSearchString: string;
  isSearching: boolean;
  searchError: string | null;
  searchPlayerWithDebounce: DebouncedState<(value: string) => Promise<void>>;
  handlePlayerSearchStringChange: (searchString: string) => void;
  setPlayerSearchString: (searchString: string) => void;
  clearSearch: () => void;
}

export const usePlayerSearch = (): PlayerSearchInterface => {
  const { searchPlayers } = useScoreSaber();
  const [playerSearchString, setPlayerSearchString] = useState("");
  const [playerSearchResults, setPlayerSearchResults] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const searchPlayerWithDebounce = useDebouncedCallback(
    async (value: string) => {
      if (value.length < MIN_QUERY_LENGTH) {
        return;
      }

      const seq = ++requestSeq.current;
      setIsSearching(true);

      // Search candidates render country flags; fetch the lazily loaded
      // flag stylesheet in parallel with the search request so it is ready
      // before the results render. (Kept out of the keystroke path so typing
      // bursts are never delayed by the stylesheet fetch.)
      void ensureFlagIconsCss();

      try {
        const players = await searchPlayers(value);
        if (seq !== requestSeq.current) return;
        setPlayerSearchResults(players);
      } catch (error) {
        if (seq !== requestSeq.current) return;
        console.error("[usePlayerSearch] Player search failed.", error);
        setPlayerSearchResults([]);
        setSearchError("プレイヤーの検索に失敗しました。再度お試しください。");
      } finally {
        if (seq === requestSeq.current) setIsSearching(false);
      }
    },
    DEBOUNCE_MS,
    { maxWait: MAX_WAIT_MS },
  );

  const handlePlayerSearchStringChange = useCallback(
    (searchString: string) => {
      setPlayerSearchString(searchString);
      setSearchError(null);
      requestSeq.current += 1;

      if (searchString.length < MIN_QUERY_LENGTH) {
        searchPlayerWithDebounce.cancel();
        setPlayerSearchResults([]);
        setIsSearching(false);
        return;
      }

      searchPlayerWithDebounce(searchString);
    },
    [searchPlayerWithDebounce],
  );

  const setPlayerSearchStringWithoutSearch = useCallback(
    (searchString: string) => {
      searchPlayerWithDebounce.cancel();
      requestSeq.current += 1;
      setPlayerSearchString(searchString);
      setPlayerSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
    },
    [searchPlayerWithDebounce],
  );

  const clearSearch = useCallback(() => {
    searchPlayerWithDebounce.cancel();
    requestSeq.current += 1;
    setPlayerSearchString("");
    setPlayerSearchResults([]);
    setIsSearching(false);
    setSearchError(null);
  }, [searchPlayerWithDebounce]);

  return {
    playerSearchResults,
    playerSearchString,
    isSearching,
    searchError,
    searchPlayerWithDebounce,
    handlePlayerSearchStringChange,
    setPlayerSearchString: setPlayerSearchStringWithoutSearch,
    clearSearch,
  };
};
