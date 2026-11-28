import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  buildPlaylistFile,
  downloadPlaylistFile,
  isValidSongHash,
} from "../utils/beatlist";
import type { PlaylistExportInput } from "../types/beatlist";
import { trackEvent } from "../../../common/analytics/googleAnalytics";

export const BEATSAVER_BASE_URL = "/api/beatsaver";

/**
 * BeatSaver キーのセッション内キャッシュ（hash -> key）。
 *
 * 書き出しのたびに同じ譜面を再照会すると、`<a download>` のクリックがネットワーク
 * 応答待ちで遅延し、ユーザー操作を伴わない発火になる。実ブラウザでは連続する自動
 * ダウンロードが無言でブロックされるため、2 回目以降は解決済みキーを使って即座に
 * 出力する。失敗はキャッシュしない（BeatSaver 復旧後に再試行できる）。
 */
const beatSaverKeyCache = new Map<string, string>();

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
  /** BeatSaver 照会〜プレイリスト作成中 */
  isExporting: boolean;
  /** ダウンロード発火後の受け渡し中（連打防止のためボタンを無効化する） */
  isSaving: boolean;
  /** 出力完了のフィードバック（✓ 出力済み）を表示中 */
  justSaved: boolean;
  resolvedCount: number;
  totalCount: number;
  error: PlaylistExportError | null;
}

export type PlaylistExportError =
  | { key: "playlist.noSongs" }
  | { key: "playlist.saveFailed" }
  | {
      key: "playlist.partialFailure";
      values: { count: number; failed: number };
    };

const INITIAL_STATE: PlaylistExportState = {
  isExporting: false,
  isSaving: false,
  justSaved: false,
  resolvedCount: 0,
  totalCount: 0,
  error: null,
};

/**
 * ダウンロード発火後の受け渡し猶予。ブラウザはプログラム的なダウンロードの
 * 進捗を JS から観測できないため、この間はボタンを無効化して連打（連続する
 * 自動ダウンロード＝実ブラウザで無言ブロックされる原因）を防ぐ。
 */
const SAVE_HANDOFF_MS = 1_200;

/** 「出力済み」フィードバックを表示する時間。 */
const SAVED_FEEDBACK_MS = 1_500;

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
  const timersRef = useRef<number[]>([]);

  // アンマウント後に残ったタイマーで状態を更新しないようにする。
  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    },
    [],
  );

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      timersRef.current.push(window.setTimeout(resolve, ms));
    });
  }, []);

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
      trackEvent({
        event: "playlist_export",
        status: "failure",
        song_count: 0,
        lookup_failure_count: 0,
      });
      setState({
        ...INITIAL_STATE,
        error: { key: "playlist.noSongs" },
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

    // 前回の書き出しで解決済みのキーもここで引き当てる。
    for (const hash of hashes) {
      const cached = beatSaverKeyCache.get(hash);
      if (cached && !keysByHash.has(hash)) keysByHash.set(hash, cached);
    }

    const missingHashes = hashes.filter((hash) => !keysByHash.has(hash));

    setState({
      ...INITIAL_STATE,
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
        if (match?.key) {
          keysByHash.set(hash, match.key);
          beatSaverKeyCache.set(hash, match.key);
        }
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
      trackEvent({
        event: "playlist_export",
        status: "failure",
        song_count: 0,
        lookup_failure_count: lookupFailed,
      });
      setState({
        ...INITIAL_STATE,
        error: { key: "playlist.noSongs" },
      });
      return;
    }

    try {
      downloadPlaylistFile(playlist);
    } catch {
      exportingRef.current = false;
      trackEvent({
        event: "playlist_export",
        status: "failure",
        song_count: playlist.songs.length,
        lookup_failure_count: lookupFailed,
      });
      setState({
        ...INITIAL_STATE,
        error: { key: "playlist.saveFailed" },
      });
      return;
    }

    // ここから先はダウンロードの受け渡しフェーズ。ブラウザはダウンロードの
    // 進捗を JavaScript から観測できないため、一定時間ボタンを無効化して連打
    // （連続する自動ダウンロード＝実ブラウザで無言ブロックされる原因）を防ぐ。
    const partialError: PlaylistExportError | null =
      lookupFailed > 0
        ? {
            key: "playlist.partialFailure",
            values: { count: playlist.songs.length, failed: lookupFailed },
          }
        : null;

    trackEvent({
      event: "playlist_export",
      status: lookupFailed > 0 ? "partial" : "success",
      song_count: playlist.songs.length,
      lookup_failure_count: lookupFailed,
    });
    setState({
      isExporting: false,
      isSaving: true,
      justSaved: false,
      resolvedCount: 0,
      totalCount: 0,
      error: partialError,
    });

    await delay(SAVE_HANDOFF_MS);

    exportingRef.current = false;
    setState((current) => ({ ...current, isSaving: false, justSaved: true }));

    await delay(SAVED_FEEDBACK_MS);

    setState((current) => ({ ...current, justSaved: false }));
  }, [delay]);

  const clearError = useCallback(
    () => setState((current) => ({ ...current, error: null })),
    [],
  );

  return { ...state, exportPlaylist, clearError };
};
