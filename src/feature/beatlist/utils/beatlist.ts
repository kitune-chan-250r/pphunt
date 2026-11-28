import type {
  PlaylistDifficulty,
  PlaylistFile,
  PlaylistSourceSong,
} from "../types/beatlist";

/** SHA-1 style hash: 40 hex characters. */
const HASH_PATTERN = /^[0-9a-f]{40}$/i;

export const isValidSongHash = (hash: string) => HASH_PATTERN.test(hash);

const difficultyKey = (difficulty: PlaylistDifficulty) =>
  `${difficulty.characteristic.toLowerCase()}/${difficulty.name.toLowerCase()}`;

interface BuildPlaylistInput {
  title: string;
  author?: string;
  description?: string;
  songs: PlaylistSourceSong[];
  /** BeatSaver keys resolved from BeatSaver, keyed by lowercase hash. */
  keysByHash?: Map<string, string>;
}

/**
 * Deduplicates songs by map hash (a map can appear once per difficulty) and
 * merges their difficulties into one song entry. Songs with an invalid hash
 * are skipped.
 */
export const buildPlaylistFile = ({
  title,
  author,
  description,
  songs,
  keysByHash,
}: BuildPlaylistInput): PlaylistFile => {
  const entries = new Map<string, PlaylistFile["songs"][number]>();

  for (const song of songs) {
    const hash = song.hash.toLowerCase();
    if (!isValidSongHash(hash)) continue;

    const candidate: PlaylistDifficulty = {
      characteristic: song.characteristic,
      name: song.difficulty,
    };

    const existing = entries.get(hash);
    if (existing) {
      const seen = new Set((existing.difficulties ?? []).map(difficultyKey));
      if (!seen.has(difficultyKey(candidate))) {
        existing.difficulties = [...(existing.difficulties ?? []), candidate];
      }
      continue;
    }

    const key = keysByHash?.get(hash);
    entries.set(hash, {
      hash,
      ...(key ? { key } : {}),
      levelid: `custom_level_${hash}`,
      difficulties: [candidate],
    });
  }

  return {
    playlistTitle: title,
    ...(author ? { playlistAuthor: author } : {}),
    ...(description ? { playlistDescription: description } : {}),
    songs: [...entries.values()],
  };
};

/** Filesystem-safe name for the downloaded playlist. */
export const sanitizePlaylistFilename = (title: string) => {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? cleaned : "playlist";
};

/**
 * Grace period before releasing the object URL. Revoking it in the same task
 * as the anchor click can abort the download before the browser has started
 * it (silently, with no console output), so give it time to kick off.
 */
const OBJECT_URL_RELEASE_DELAY_MS = 2_000;

export const downloadPlaylistFile = (file: PlaylistFile) => {
  const json = JSON.stringify(file, null, 2);
  // Round-trip parse to guarantee the output is valid JSON before saving.
  JSON.parse(json);

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizePlaylistFilename(file.playlistTitle)}.bplist`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_RELEASE_DELAY_MS);
};
