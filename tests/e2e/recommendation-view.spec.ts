import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  Leaderboard,
  PaginatedResponse,
  PlayerProfile,
  PlayerScoreEntry,
  RankedPlayer,
  Score,
} from "../../src/feature/scoresaber/types/ScoreSaber";

/**
 * 提案5（ソート／フィルタ＋同一曲まとめ）の E2E:
 * - 同じ曲（map.id が同じ）の Expert / Expert+ は既定で1グループにまとまり、
 *   「同じ曲の他の難易度」ボタンで展開できること。
 * - 難易度フィルタで表示件数が絞られ、件数表示が追随すること。
 * - stars順ソートで最高 stars の難易度がグループ代表として先頭に来ること。
 */

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const targetPlayer = makePlayer("player-1", "Target Player", 500);
const competitor1 = makePlayer("player-2", "Fresh Player", 501);

const duetExpert = makeLeaderboard({
  id: 401,
  mapId: 900,
  hash: "duet-hash",
  songName: "Duet Song",
  stars: 10,
  difficulty: 7,
  rawDifficulty: "Expert",
});
const duetExpertPlus = makeLeaderboard({
  id: 402,
  mapId: 900,
  hash: "duet-hash",
  songName: "Duet Song",
  stars: 12,
  difficulty: 9,
  rawDifficulty: "ExpertPlus",
});
const soloHard = makeLeaderboard({
  id: 403,
  mapId: 901,
  hash: "solo-hard-hash",
  songName: "Solo Hard",
  stars: 6,
  difficulty: 5,
  rawDifficulty: "Hard",
});
const soloExpert = makeLeaderboard({
  id: 404,
  mapId: 902,
  hash: "solo-expert-hash",
  songName: "Solo Expert",
  stars: 8,
  difficulty: 7,
  rawDifficulty: "Expert",
});
const fillerMapA = makeLeaderboard({
  id: 304,
  mapId: 304,
  hash: "filler-a-hash",
  songName: "Filler A",
  stars: 10,
  difficulty: 7,
  rawDifficulty: "Expert",
});
const fillerMapB = makeLeaderboard({
  id: 305,
  mapId: 305,
  hash: "filler-b-hash",
  songName: "Filler B",
  stars: 11,
  difficulty: 7,
  rawDifficulty: "Expert",
});
const fillerMapC = makeLeaderboard({
  id: 306,
  mapId: 306,
  hash: "filler-c-hash",
  songName: "Filler C",
  stars: 12,
  difficulty: 7,
  rawDifficulty: "Expert",
});

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

function makePlayer(id: string, name: string, rank: number): RankedPlayer {
  return {
    id,
    name,
    playerNameInGame: name,
    country: "JP",
    role: null,
    avatar: "",
    avatarVersion: 1,
    permissions: 0,
    banned: false,
    silenced: false,
    inactive: false,
    stats: {
      realmId: 1,
      realmName: "Global",
      rank,
      countryRank: rank,
      rankChange: null,
      totalPP: 10_000,
      plusOnePP: 20,
      totalScore: "1000000",
      totalRankedScore: "1000000",
      totalPlayedLeaderboards: 3,
      totalPlayedRankedLeaderboards: 3,
      totalSubmittedPlays: 3,
      totalReplayViews: 0,
      averageAccuracy: 90,
      weightedAverageAccuracy: 90,
      completionAccuracy: 90,
      device: null,
    },
  };
}

function makeLeaderboard(args: {
  id: number;
  mapId: number;
  hash: string;
  songName: string;
  stars: number;
  difficulty: number;
  rawDifficulty: string;
}): Leaderboard {
  return {
    id: args.id,
    map: {
      id: args.mapId,
      hash: args.hash,
      bsid: null,
      songName: args.songName,
      songSubName: "",
      songAuthorName: "Test Artist",
      levelAuthorName: "Test Mapper",
      bpm: 120,
      coverUrl: "",
      verified: true,
    },
    difficulty: {
      id: args.id,
      difficulty: args.difficulty,
      rawDifficulty: args.rawDifficulty,
      gameMode: "Standard",
    },
    maxScore: 1_000_000,
    totalScores: 10,
    dailyScores: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
    realm: {
      realmId: 1,
      realmName: "Global",
      leaderboardStatus: "RANKED",
      positiveModifiers: false,
      stars: args.stars,
      rankedAt: null,
      qualifiedAt: null,
      lovedAt: null,
    },
  };
}

function makeScore(
  player: RankedPlayer,
  modifiedScore: number,
  pp: number,
  accuracy: number,
  createdAt: string,
): Score {
  return {
    id: modifiedScore,
    rank: 1,
    unmodifiedScore: modifiedScore,
    modifiedScore,
    accuracy,
    pp,
    weight: 1,
    mods: [],
    badCuts: 0,
    missedNotes: 0,
    maxCombo: 100,
    fullCombo: true,
    hasReplay: false,
    replayViewCount: 0,
    personalBest: true,
    legacyHmdId: null,
    version: null,
    playOutcome: "CLEAR",
    playOutcomeTime: null,
    createdAt,
    player: {
      id: player.id,
      name: player.name,
      playerNameInGame: player.playerNameInGame,
      country: player.country,
      role: player.role,
      avatar: player.avatar,
      avatarVersion: player.avatarVersion,
      permissions: player.permissions,
    },
    device: null,
  };
}

function makePaginatedResponse<T>(data: T[]): PaginatedResponse<T> {
  return {
    data,
    metadata: {
      page: 1,
      itemsPerPage: data.length,
      totalItems: data.length,
      totalPages: 1,
    },
  };
}

const targetScores: PlayerScoreEntry[] = [
  {
    leaderboard: fillerMapA,
    score: makeScore(targetPlayer, 850_000, 50, 88, daysAgo(60)),
  },
  {
    leaderboard: fillerMapB,
    score: makeScore(targetPlayer, 840_000, 40, 86, daysAgo(90)),
  },
  {
    leaderboard: fillerMapC,
    score: makeScore(targetPlayer, 800_000, 10, 85, daysAgo(30)),
  },
];

const competitor1Scores: PlayerScoreEntry[] = [
  {
    leaderboard: duetExpert,
    score: makeScore(competitor1, 965_000, 30, 96, daysAgo(5)),
  },
  {
    leaderboard: duetExpertPlus,
    score: makeScore(competitor1, 960_000, 35, 96, daysAgo(5)),
  },
  {
    leaderboard: soloHard,
    score: makeScore(competitor1, 955_000, 28, 96, daysAgo(5)),
  },
  {
    leaderboard: soloExpert,
    score: makeScore(competitor1, 958_000, 32, 96, daysAgo(5)),
  },
];

const scoresByPlayerId = new Map<string, PlayerScoreEntry[]>([
  [targetPlayer.id, targetScores],
  [competitor1.id, competitor1Scores],
]);

const allPlayers = [targetPlayer, competitor1];

async function installApiMocks(page: Page): Promise<void> {
  await page.route("**/api/scoresaber/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/scoresaber/, "");
    const { searchParams } = url;

    if (pathname === "/api/v2/players" && searchParams.has("search")) {
      return fulfillJson(route, makePaginatedResponse([targetPlayer]));
    }

    if (pathname === "/api/v2/players" && searchParams.has("page")) {
      return fulfillJson(route, makePaginatedResponse(allPlayers));
    }

    const playerPath = pathname.match(/^\/api\/v2\/players\/([^/]+)$/);
    if (playerPath) {
      const player = allPlayers.find(({ id }) => id === playerPath[1]);
      if (!player) {
        return fulfillJson(route, { error: "Player not found" }, 404);
      }
      return fulfillJson(route, player satisfies PlayerProfile);
    }

    const scoresPath = pathname.match(/^\/api\/v2\/players\/([^/]+)\/scores$/);
    if (scoresPath) {
      const scores = scoresByPlayerId.get(scoresPath[1]) ?? [];
      return fulfillJson(route, makePaginatedResponse(scores));
    }

    if (
      pathname.startsWith(`/api/v2/players/${targetPlayer.id}/scores/hash/`)
    ) {
      // 候補はすべて未プレイとして 404 を返す。
      return fulfillJson(route, { error: "No score found" }, 404);
    }

    return fulfillJson(
      route,
      { error: `Unexpected API request: ${pathname}` },
      500,
    );
  });
}

test("未プレイ候補で同一曲まとめ・難易度フィルタ・stars順ソートが働く", async ({
  page,
}) => {
  await installApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Target");
  const playerOption = page.getByRole("option", { name: /Target Player/ });
  await expect(playerOption).toBeVisible();
  await playerOption.click();

  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();

  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (4)",
  });
  await unplayedTab.click();

  const cards = page.getByRole("article");
  const controls = page.getByRole("group", {
    name: "表示の絞り込みと並び替え",
  });
  await expect(controls).toBeVisible();

  // 既定は同一曲まとめON: Duet Song の2難易度は1枚にまとまる（全3枚）。
  await expect(cards).toHaveCount(3);
  const expandButton = page.getByRole("button", {
    name: "同じ曲の他の難易度 (1件)",
  });
  await expect(expandButton).toBeVisible();

  // 展開すると2難易度とも見える（全4枚）。
  await expandButton.click();
  await expect(cards).toHaveCount(4);

  // 難易度フィルタ Expert+ : Duet Song の Expert+ だけが残る。
  await controls.getByText("Expert+", { exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Duet Song");
  await expect(controls.getByText("4件中 1件を表示")).toBeVisible();

  // リセットで全件に戻る。
  await controls.getByRole("button", { name: "リセット" }).click();
  await expect(cards).toHaveCount(3);
  await expect(controls.getByText("4件")).toBeVisible();

  // stars順: 最高 stars（12）の Expert+ が Duet Song の代表として先頭に来る。
  await controls.getByRole("combobox", { name: "並び順" }).click();
  await page.getByRole("option", { name: "stars順" }).click();
  await expect(cards.first()).toContainText("Duet Song");
  await expect(cards.first()).toContainText("Expert+");
  await expect(cards.first()).toContainText("12.00 stars");
});
