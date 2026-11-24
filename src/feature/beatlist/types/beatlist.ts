/**
 * Beat Saber custom playlist (.bplist) data model.
 * Follows the PlaylistManager-compatible community spec:
 * - root requires `playlistTitle`; `songs` is always an array
 * - custom songs require `hash`; `key` (BeatSaver key) is recommended
 *   so players without the song can download it
 * - custom song `levelid` is `custom_level_` + hash
 */

export interface PlaylistDifficulty {
  characteristic: string;
  name: string;
}

export interface PlaylistSong {
  hash: string;
  key?: string;
  levelid: string;
  difficulties?: PlaylistDifficulty[];
}

export interface PlaylistFile {
  playlistTitle: string;
  playlistAuthor?: string;
  playlistDescription?: string;
  songs: PlaylistSong[];
}

/**
 * Minimal per-song input this feature needs from any caller.
 * Callers map their own domain objects (recommendations, search results, …)
 * to this shape so the feature stays self-contained.
 */
export interface PlaylistSourceSong {
  /** Map hash (SHA-1, 40 hex characters). */
  hash: string;
  /** BeatSaver key when already known (e.g. ScoreSaber `bsid`). */
  bsid?: string | null;
  /** Characteristic (game mode) of the suggested difficulty. */
  characteristic: string;
  /** Difficulty name of the suggested difficulty. */
  difficulty: string;
}

export interface PlaylistExportInput {
  title: string;
  author?: string;
  description?: string;
  songs: PlaylistSourceSong[];
}
