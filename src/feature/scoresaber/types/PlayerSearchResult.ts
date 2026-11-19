export type Player = {
  id: string;
  name: string;
  playerNameInGame: string;
  country: string;
  role: string | null;
  avatar: string;
  avatarVersion: number;
  permissions: number;
  banned: boolean;
  silenced: boolean;
  inactive: boolean;
  stats: PlayerStats;
};

export type PlayerStats = {
  realmId: number;
  realmName: string;
  rank: number;
  countryRank: number;
  rankChange: number | null;
  totalPP: number;
  plusOnePP: number | null;
  totalScore: string;
  totalRankedScore: string;
  totalPlayedLeaderboards: number;
  totalPlayedRankedLeaderboards: number;
  totalSubmittedPlays: number;
  totalReplayViews: number;
  averageAccuracy: number;
  weightedAverageAccuracy: number;
  completionAccuracy: number;
  device: PlayerDevice | null;
};

export type PlayerDevice = {
  hmd: string | null;
  controllerLeft: string | null;
  controllerRight: string | null;
};

export type PlayerSearchResultMetadata = {
  page: number;
  itemsPerPage: number;
  totalItems: number;
  totalPages: number;
};

export type PlayerSearchResultResponse = {
  data: Player[];
};
