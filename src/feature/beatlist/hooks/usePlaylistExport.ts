import { useCallback, useRef, useState } from "react";
import axios from "axios";
import {
  buildPlaylistFile,
  downloadPlaylistFile,
  isValidSongHash,
} from "../utils/beatlist";
import type { PlaylistExportInput } from "../types/beatlist";

export const BEATSAVER_BASE_URL = "/api/beatsaver";

interface BeatSaverVersion {
  key: string;
  hash: string;
}

interface BeatSaverMap {
  key: string;
  versions?: Record<string, BeatSaverVersion>;
}

/** `GET /maps/hash/{hash}` returns a single map or a list, depending on matches. */
interface BeatSaverHashResponse {
  metadata?: { changeLog?: string };
  maps?: BeatSaverMap[];
  key?: string;
  versions?: Record<string, BeatSaverVersion>;
}

export interface PlaylistExportState {
  isExporting: boolean;
  resolvedCount: number;
  totalCount: number;
  error: string | null;
}

const INITIAL_STATE: PlaylistExportState = {
  isExporting: false,
  resolvedCount: 0,
  totalCount: 0,
  error: null,
};

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

/**
 * Resolves BeatSaver keys for the given songs (so players who do not own a
 * song can download it) and saves the result as a `.bplist` playlist file.
 */
export const usePlaylistExport = () => {
  const [state, setState] = useState<PlaylistExportState>(INITIAL_STATE);
  const exportingRef = useRef(false);

  const exportPlaylist = useCallback(async (input: PlaylistExportInput) => {
    if (exportingRef.current) return;
    exportingRef.current = true;

    const hashes = [
      ...new Set(
        input.songs
          .map((song) => song.hash.toLowerCase())
          .filter(isValidSongHash),
      ),
    ];

    if (hashes.length === 0) {
      exportingRef.current = false;
      setState({
        ...INITIAL_STATE,
        error: "プレイリストに出力できる譜面がありません。",
      });
      return;
    }

    // ScoreSaberのbsidがBeatSaver Keyそのものなので、まずそれを採用する。
    const keysByHash = new Map<string, string>();
    for (const song of input.songs) {
      const normalizedHash = song.hash.toLowerCase();
      if (
        isValidSongHash(normalizedHash) &&
        song.bsid &&
        !keysByHash.has(normalizedHash)
      ) {
        keysByHash.set(normalizedHash, song.bsid);
      }
    }

    const missingHashes = hashes.filter((hash) => !keysByHash.has(hash));

    setState({
      isExporting: true,
      resolvedCount: 0,
      totalCount: missingHashes.length,
      error: null,
    });

    let lookupFailed = 0;
    await mapWithConcurrency(missingHashes, 4, async (hash) => {
      try {
        const response = await axios.get<BeatSaverHashResponse>(
          `${BEATSAVER_BASE_URL}/maps/hash/${hash}`,
          {
            headers: { Accept: "application/json" },
            timeout: 15_000,
          },
        );
        const body = response.data;
        const maps: BeatSaverMap[] = Array.isArray(body.maps)
          ? body.maps
          : body.key
            ? [body as BeatSaverMap]
            : [];
        const match =
          maps.find((map) =>
            Object.values(map.versions ?? {}).some(
              (version) => version.hash.toLowerCase() === hash,
            ),
          ) ?? maps[0];
        if (match?.key) keysByHash.set(hash, match.key);
      } catch {
        lookupFailed += 1;
      }
      setState((current) => ({
        ...current,
        resolvedCount: current.resolvedCount + 1,
      }));
    });

    const playlist = buildPlaylistFile({
      title: input.title,
      author: input.author,
      description: input.description,
      songs: input.songs,
      keysByHash,
    });

    if (playlist.songs.length === 0) {
      exportingRef.current = false;
      setState({
        ...INITIAL_STATE,
        error: "プレイリストに出力できる譜面がありません。",
      });
      return;
    }

    try {
      downloadPlaylistFile(playlist);
    } catch {
      exportingRef.current = false;
      setState({
        ...INITIAL_STATE,
        error: "プレイリストの保存に失敗しました。",
      });
      return;
    }

    exportingRef.current = false;
    setState({
      ...INITIAL_STATE,
      error:
        lookupFailed > 0
          ? `${playlist.songs.length}曲を出力しました。${lookupFailed}曲はBeatSaver Keyを解決できなかったため、所持している譜面のみ再生できます。`
          : null,
    });
  }, []);

  const clearError = useCallback(
    () => setState((current) => ({ ...current, error: null })),
    [],
  );

  return { ...state, exportPlaylist, clearError };
};
