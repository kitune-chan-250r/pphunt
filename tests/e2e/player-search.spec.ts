import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  Leaderboard,
  PaginatedResponse,
  PlayerProfile,
  PlayerScoreEntry,
  RankedPlayer,
  Score,
} from "../../src/feature/scoresaber/types/ScoreSaber";

const targetPlayer = makePlayer("player-1", "Aoi Player", 1);
const competitor = makePlayer("player-2", "Mira Player", 2);
const playedMap = makeLeaderboard(101, "played-map-hash", "Played Map");
const unplayedMap = makeLeaderboard(202, "unplayed-map-hash", "Unplayed Map");

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
      totalPP: 12_345,
      plusOnePP: 20,
      totalScore: "1000000",
      totalRankedScore: "1000000",
      totalPlayedLeaderboards: 1,
      totalPlayedRankedLeaderboards: 1,
      totalSubmittedPlays: 1,
      totalReplayViews: 0,
      averageAccuracy: 95.5,
      weightedAverageAccuracy: 95.5,
      completionAccuracy: 95.5,
      device: null,
    },
  };
}

function makeLeaderboard(
  id: number,
  hash: string,
  songName: string,
): Leaderboard {
  return {
    id,
    map: {
      id,
      hash,
      bsid: null,
      songName,
      songSubName: "",
      songAuthorName: "Test Artist",
      levelAuthorName: "Test Mapper",
      bpm: 120,
      coverUrl: "",
      verified: true,
    },
    difficulty: {
      id,
      difficulty: 4,
      rawDifficulty: "Expert",
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
      stars: 5,
      rankedAt: null,
      qualifiedAt: null,
      lovedAt: null,
    },
  };
}

function makeScore(player: RankedPlayer, modifiedScore: number, pp: number): Score {
  return {
    id: modifiedScore,
    rank: 1,
    unmodifiedScore: modifiedScore,
    modifiedScore,
    accuracy: 95,
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
    createdAt: "2025-01-01T00:00:00.000Z",
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
    leaderboard: playedMap,
    score: makeScore(targetPlayer, 900_000, 12),
  },
];

const competitorScores: PlayerScoreEntry[] = [
  {
    leaderboard: playedMap,
    score: makeScore(competitor, 950_000, 14),
  },
  {
    leaderboard: unplayedMap,
    score: makeScore(competitor, 1_000_000, 25),
  },
];

async function installSuccessfulApiMocks(page: Page): Promise<string[]> {
  const searchQueries: string[] = [];

  await page.route("https://scoresaber.com/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const { pathname, searchParams } = url;

    if (pathname === "/api/v2/players" && searchParams.has("search")) {
      searchQueries.push(searchParams.get("search") ?? "");
      return fulfillJson(
        route,
        makePaginatedResponse([targetPlayer, competitor]),
      );
    }

    if (pathname === "/api/v2/players" && searchParams.has("page")) {
      return fulfillJson(
        route,
        makePaginatedResponse([targetPlayer, competitor]),
      );
    }

    const playerPath = pathname.match(/^\/api\/v2\/players\/([^/]+)$/);
    if (playerPath) {
      const player = [targetPlayer, competitor].find(
        ({ id }) => id === playerPath[1],
      );
      if (!player) {
        return fulfillJson(route, { error: "Player not found" }, 404);
      }
      return fulfillJson(route, player satisfies PlayerProfile);
    }

    const scoresPath = pathname.match(/^\/api\/v2\/players\/([^/]+)\/scores$/);
    if (scoresPath) {
      const scores =
        scoresPath[1] === targetPlayer.id ? targetScores : competitorScores;
      return fulfillJson(route, makePaginatedResponse(scores));
    }

    if (
      pathname ===
      `/api/v2/players/${targetPlayer.id}/scores/hash/${unplayedMap.map.hash}/Standard/4`
    ) {
      return fulfillJson(route, { error: "No score found" }, 404);
    }

    return fulfillJson(route, { error: `Unexpected API request: ${pathname}` }, 500);
  });

  return searchQueries;
}

test("プレイヤーを検索し、詳細な譜面のおすすめを表示する", async ({ page }) => {
  const searchQueries = await installSuccessfulApiMocks(page);

  await page.goto("/");
  await expect(page).toHaveTitle("PPHunt");

  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });

  await searchInput.fill("Ao");
  await page.waitForTimeout(400);
  expect(searchQueries).toEqual([]);

  await searchInput.fill("Aoi");
  const playerOption = page.getByRole("option", { name: /Aoi Player/ });
  await expect(playerOption).toContainText("JP · #1");
  await playerOption.click();

  const profile = page.getByRole("region", {
    name: "Aoi Player のプレイヤープロフィール",
  });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("#1");
  await expect(profile).toContainText("12,345.00");
  await expect(profile).toContainText("95.50%");
  await expect(profile).toContainText("20.00 PP");
  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();

  const recommendationCards = page.getByRole("article");
  await expect(recommendationCards).toHaveCount(1);
  const improvementCard = recommendationCards.first();
  await expect(improvementCard).toContainText("Played Map");
  await expect(improvementCard).toContainText("更新候補");
  await expect(improvementCard).toContainText("Expert");
  await expect(improvementCard).toContainText("周辺 1人がプレイ");
  await expect(improvementCard).toContainText("14.0");
  await expect(improvementCard).toContainText("周辺最高: 950,000");
  await expect(improvementCard).toContainText("自分: 900,000");

  const improvementTab = page.getByRole("tab", {
    name: "スコア更新候補 (1)",
  });
  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (1)",
  });
  await expect(improvementTab).toHaveAttribute("aria-selected", "true");
  await unplayedTab.click();
  await expect(recommendationCards).toHaveCount(1);
  const unplayedCard = recommendationCards.first();
  await expect(unplayedCard).toContainText("Unplayed Map");
  await expect(unplayedCard).toContainText("未プレイ");
  await expect(unplayedCard).toContainText("周辺最高: 1,000,000");
  await expect(unplayedCard).toContainText("Mira Player · #2");
  await expect(unplayedCard).not.toContainText("自分:");

  await improvementTab.click();
  await expect(recommendationCards.first()).toContainText("Played Map");
});

test("検索欄をクリアして別のプレイヤーを選択する", async ({ page }) => {
  const searchQueries = await installSuccessfulApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });

  await searchInput.fill("Aoi");
  await page.getByRole("option", { name: /Aoi Player/ }).click();
  await expect(
    page.getByRole("region", { name: "Aoi Player のプレイヤープロフィール" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "検索欄をクリア" }).click();
  await expect(searchInput).toHaveValue("");
  await expect(
    page.getByRole("region", { name: "Aoi Player のプレイヤープロフィール" }),
  ).toBeVisible();

  await searchInput.fill("Mira");
  const nextPlayerOption = page.getByRole("option", { name: /Mira Player/ });
  await expect(nextPlayerOption).toContainText("JP · #2");
  await nextPlayerOption.click();
  await expect(
    page.getByRole("region", { name: "Mira Player のプレイヤープロフィール" }),
  ).toBeVisible();
  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();
  await expect.poll(() => searchQueries).toEqual(["Aoi", "Mira"]);
});
