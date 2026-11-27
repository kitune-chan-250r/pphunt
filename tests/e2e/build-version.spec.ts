import { expect, test, type Page, type Route } from "@playwright/test";
import type {
  Leaderboard,
  PaginatedResponse,
  PlayerProfile,
  PlayerScoreEntry,
  RankedPlayer,
  Score,
} from "../../src/feature/scoresaber/types/ScoreSaber";

const versionLinePattern = /^v1\.0\.0 · \S+ · \d{4}-\d{2}-\d{2}$/;

test("ページ最下部にビルドバージョンが表示される", async ({ page }) => {
  await page.goto("/");

  const versionLine = page.getByText(versionLinePattern);
  await expect(versionLine).toBeVisible();

  // 最下部の要素であること（ページ末尾に配置されていること）を確認する
  const isLastInFlow = await versionLine.evaluate((element) => {
    let last = element;
    while (last.parentElement && last.parentElement.id !== "root") {
      last = last.parentElement;
    }
    const siblings = Array.from(last.parentElement?.children ?? []);
    return siblings[siblings.length - 1] === last;
  });
  expect(isLastInFlow).toBe(true);
});

test("初期表示ではスクロールしなくてもビルドバージョンが見える", async ({
  page,
}) => {
  await page.goto("/");

  const versionLine = page.getByText(versionLinePattern);
  await expect(versionLine).toBeVisible();

  // バージョン行がビューポート内に収まっていること
  const box = await versionLine.boundingBox();
  expect(box).not.toBeNull();
  const innerHeight = await page.evaluate(() => window.innerHeight);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(innerHeight + 1);

  // ページ全体が縦スクロール不要な高さであること
  const scrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight,
  );
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
});

// --- プレイヤー検索後の配置確認用モック（player-search.spec.ts と同じ構成） ---

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

function makeScore(
  player: RankedPlayer,
  modifiedScore: number,
  pp: number,
): Score {
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

async function installSuccessfulApiMocks(page: Page): Promise<void> {
  await page.route("**/api/scoresaber/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/scoresaber/, "");
    const { searchParams } = url;

    if (pathname === "/api/v2/players" && searchParams.has("search")) {
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

    return fulfillJson(
      route,
      { error: `Unexpected API request: ${pathname}` },
      500,
    );
  });
}

test("プレイヤー検索後はビルドバージョンがおすすめ譜面リストの最後に続く", async ({
  page,
}) => {
  await installSuccessfulApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Aoi");
  const playerOption = page.getByRole("option", { name: /Aoi Player/ });
  await expect(playerOption).toBeVisible();
  await playerOption.click();

  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();
  const recommendationCards = page.getByRole("article");
  await expect(recommendationCards).toHaveCount(1);

  // バージョン行の上端が、最後のおすすめ譜面カードの下端以降にあること
  // （ドキュメント座標で比較する）
  const versionLine = page.getByText(versionLinePattern);
  await expect(versionLine).toBeVisible();
  const lastCardBottom = await recommendationCards
    .last()
    .evaluate(
      (element) => element.getBoundingClientRect().bottom + window.scrollY,
    );
  const versionTop = await versionLine.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(versionTop).toBeGreaterThanOrEqual(lastCardBottom - 1);
});
