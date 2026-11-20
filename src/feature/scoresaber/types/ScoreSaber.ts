import type { Player, PlayerDevice } from "./PlayerSearchResult";

/**
 * Shared shapes for ScoreSaber API v2 responses.
 * Verified against https://scoresaber.com/api/openapi.json (OpenAPI 3.0.0).
 */

export interface PaginationMetadata {
  page: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
}

/** Envelope returned by every paginated v2 endpoint. */
export interface PaginatedResponse<T> {
  data: T[];
  metadata: PaginationMetadata;
}

/**
 * Game modes seen in the API. The schema types this as a plain string,
 * so unknown values are possible.
 */
export type GameMode = string;

export type LeaderboardStatus = "UNRANKED" | "RANKED" | "QUALIFIED" | "LOVED";

export type PlayOutcome = "CLEAR" | "FAIL" | "QUIT" | "RESTART";

export interface LeaderboardDifficulty {
  id: number;
  /** Numeric difficulty value used in `/players/{id}/scores/hash/{hash}/{mode}/{difficulty}`. */
  difficulty: number;
  rawDifficulty: string;
  gameMode: GameMode;
}

export interface LeaderboardMap {
  id: number;
  hash: string;
  bsid: string | null;
  songName: string;
  songSubName: string;
  songAuthorName: string;
  levelAuthorName: string;
  bpm: number;
  coverUrl: string;
  verified: boolean;
}

export interface LeaderboardRealm {
  realmId: number;
  realmName: string;
  leaderboardStatus: LeaderboardStatus;
  positiveModifiers: boolean;
  stars: number;
  rankedAt: string | null;
  qualifiedAt: string | null;
  lovedAt: string | null;
}

/** A leaderboard == one map + one difficulty + one game mode. Comparison key. */
export interface Leaderboard {
  id: number;
  map: LeaderboardMap;
  difficulty: LeaderboardDifficulty;
  maxScore: number;
  /** Present on live responses for some realms; not in the OpenAPI schema. */
  legacyMaxScore?: number;
  totalScores: number;
  dailyScores: number;
  createdAt: string;
  realm: LeaderboardRealm;
}

/** Minimal player reference embedded in a score payload. */
export interface ScorePlayerRef {
  id: string;
  name: string;
  playerNameInGame: string;
  country: string;
  role: string | null;
  avatar: string;
  avatarVersion: number;
  permissions: number;
}

export interface Score {
  id: number;
  rank: number;
  unmodifiedScore: number;
  modifiedScore: number;
  accuracy: number;
  pp: number;
  weight: number;
  mods: string[];
  badCuts: number;
  missedNotes: number;
  maxCombo: number;
  fullCombo: boolean;
  hasReplay: boolean;
  replayViewCount: number;
  personalBest: boolean;
  legacyHmdId: number | null;
  version: string | null;
  playOutcome: PlayOutcome;
  playOutcomeTime: number | null;
  createdAt: string;
  player: ScorePlayerRef;
  device: PlayerDevice | null;
  hasHistory?: boolean;
}

/** Item shape of `GET /api/v2/players/{id}/scores`. */
export interface PlayerScoreEntry {
  score: Score;
  leaderboard: Leaderboard;
}

/** Item shape of `GET /api/v2/leaderboards/{id}/scores` (flat score, no leaderboard wrapper). */
export type LeaderboardScoreEntry = Score;

/**
 * `GET /api/v2/players` and `GET /api/v2/players/{id}` both return this shape
 * (the single-player endpoint additionally includes badges/bio/vanity etc.,
 * which are outside the fields this feature needs).
 */
export type RankedPlayer = Player;

/** Error body returned by v2 endpoints (e.g. 404 for an unplayed leaderboard). */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: {
    resource: string;
    id?: string | number;
  };
}
