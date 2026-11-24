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
const alternatePlayer = makePlayer("player-3", "Aoi Pro", 3);
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

async function installSuccessfulApiMocks(
  page: Page,
): Promise<{ searchQueries: string[]; requests: string[] }> {
  const searchQueries: string[] = [];
  const requests: string[] = [];

  await page.route("**/api/scoresaber/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/scoresaber/, "");
    const { searchParams } = url;
    requests.push(`${pathname}${url.search}`);

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

    // co-play シーディング用のリーダーボードスコア（新アルゴリズムで使用）
    if (/^\/api\/v2\/leaderboards\/\d+\/scores$/.test(pathname)) {
      return fulfillJson(route, makePaginatedResponse([]));
    }

    if (
      pathname ===
      `/api/v2/players/${targetPlayer.id}/scores/hash/${unplayedMap.map.hash}/Standard/4`
    ) {
      return fulfillJson(route, { error: "No score found" }, 404);
    }

    return fulfillJson(route, { error: `Unexpected API request: ${pathname}` }, 500);
  });

  return { searchQueries, requests };
}

async function installSearchApiMock(
  page: Page,
  respond: (route: Route, query: string) => Promise<void>,
): Promise<string[]> {
  const searchQueries: string[] = [];

  await page.route("**/api/scoresaber/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/scoresaber/, "");
    if (
      pathname === "/api/v2/players" &&
      url.searchParams.has("search")
    ) {
      const query = url.searchParams.get("search") ?? "";
      searchQueries.push(query);
      return respond(route, query);
    }

    return fulfillJson(route, { error: "Unexpected API request" }, 500);
  });

  return searchQueries;
}

test("初期表示と入力文字数に応じた候補検索を確認する", async ({ page }) => {
  const { searchQueries } = await installSuccessfulApiMocks(page);

  await page.clock.install();
  await page.goto("/");
  await expect(page).toHaveTitle("PPHunt");

  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await expect(searchInput).toHaveValue("");
  await expect(searchInput).toHaveAttribute(
    "placeholder",
    "検索するプレイヤー名を入力",
  );
  await expect(
    page.getByRole("button", { name: "検索欄をクリア" }),
  ).toHaveCount(0);

  await searchInput.fill("Ao");
  await expect(page.getByText("3文字以上で検索", { exact: true })).toBeVisible();
  await page.clock.fastForward(400);
  expect(searchQueries).toEqual([]);

  await searchInput.fill("Player");
  await page.clock.fastForward(400);
  const aoiOption = page.getByRole("option", { name: /Aoi Player/ });
  const miraOption = page.getByRole("option", { name: /Mira Player/ });
  await expect(aoiOption).toContainText("JP · #1");
  await expect(miraOption).toContainText("JP · #2");
  await expect.poll(() => searchQueries).toEqual(["Player"]);
  await expect(searchInput).toHaveValue("Player");
  await expect(
    page.getByRole("button", { name: "検索欄をクリア" }),
  ).toBeVisible();
});

test("連続入力では最後の検索語だけを候補検索する", async ({ page }) => {
  const { searchQueries } = await installSuccessfulApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });

  await searchInput.fill("Aoi");
  await searchInput.fill("Mira");

  await expect.poll(() => searchQueries).toEqual(["Mira"]);
  await expect(
    page.getByRole("option", { name: /Mira Player/ }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /Aoi Player/ })).toHaveCount(0);
});

test("検索中の表示から候補なしの案内に切り替わる", async ({ page }) => {
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const searchQueries = await installSearchApiMock(page, async (route) => {
    await responseGate;
    await fulfillJson(route, makePaginatedResponse([]));
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Nobody");
  await expect.poll(() => searchQueries).toEqual(["Nobody"]);
  await expect(page.getByText("検索中…", { exact: true })).toBeVisible();

  releaseResponse();
  await searchInput.press("ArrowDown");
  await expect(
    page.getByText("該当するプレイヤーがありません", { exact: true }),
  ).toBeVisible();
});

test("検索失敗時にエラーメッセージを表示する", async ({ page }) => {
  let markResponseSent!: () => void;
  const responseSent = new Promise<void>((resolve) => {
    markResponseSent = resolve;
  });
  const searchQueries = await installSearchApiMock(page, async (route, query) => {
    if (query === "Aoi") {
      await fulfillJson(route, { error: "Bad request" }, 400);
      markResponseSent();
      return;
    }

    await fulfillJson(route, makePaginatedResponse([competitor]));
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Aoi");
  await responseSent;
  await searchInput.press("ArrowDown");

  await expect(
    page.getByText("プレイヤーの検索に失敗しました。再度お試しください。", {
      exact: true,
    }),
  ).toBeVisible();

  await searchInput.fill("Mira");
  await expect.poll(() => searchQueries).toEqual(["Aoi", "Mira"]);
  await expect(
    page.getByRole("option", { name: /Mira Player/ }),
  ).toBeVisible();
  await expect(
    page.getByText("プレイヤーの検索に失敗しました。再度お試しください。", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("検索中も前の候補を表示し、新しい検索結果に置き換える", async ({
  page,
}) => {
  const miraPro = makePlayer("player-4", "Mira Pro", 4);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const searchQueries = await installSearchApiMock(page, async (route, query) => {
    if (query === "Mira P") {
      await responseGate;
      return fulfillJson(route, makePaginatedResponse([miraPro]));
    }

    return fulfillJson(route, makePaginatedResponse([competitor]));
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Mira");
  await expect(
    page.getByRole("option", { name: /Mira Player/ }),
  ).toBeVisible();

  await searchInput.fill("Mira P");
  await expect.poll(() => searchQueries).toEqual(["Mira", "Mira P"]);
  await expect(page.getByText("検索中…", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Mira Player/ }),
  ).toBeVisible();

  releaseResponse();
  await expect(page.getByRole("option", { name: /Mira Pro/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Mira Player/ })).toHaveCount(0);
});

test("後から完了した古い検索結果で新しい候補を上書きしない", async ({
  page,
}) => {
  let markFirstRequestStarted!: () => void;
  let releaseFirstResponse!: () => void;
  const firstRequestStarted = new Promise<void>((resolve) => {
    markFirstRequestStarted = resolve;
  });
  const firstResponseGate = new Promise<void>((resolve) => {
    releaseFirstResponse = resolve;
  });
  const searchQueries = await installSearchApiMock(page, async (route, query) => {
    if (query === "Aoi") {
      markFirstRequestStarted();
      await firstResponseGate;
      return fulfillJson(route, makePaginatedResponse([targetPlayer]));
    }

    return fulfillJson(route, makePaginatedResponse([alternatePlayer]));
  });

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Aoi");
  await firstRequestStarted;

  await searchInput.fill("Aoi P");
  await expect.poll(() => searchQueries).toEqual(["Aoi", "Aoi P"]);
  await expect(
    page.getByRole("option", { name: /Aoi Pro/ }),
  ).toBeVisible();

  releaseFirstResponse();
  await expect(
    page.getByRole("option", { name: /Aoi Pro/ }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /Aoi Player/ })).toHaveCount(0);
});

test("Enterキーでデバウンス中の候補検索をすぐに実行する", async ({ page }) => {
  const { searchQueries } = await installSuccessfulApiMocks(page);

  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Aoi");
  await searchInput.press("Enter");
  await page.clock.runFor(1);

  await expect.poll(() => searchQueries).toEqual(["Aoi"]);
});

test("検索予約中にクリアすると候補検索をキャンセルする", async ({ page }) => {
  const { searchQueries } = await installSuccessfulApiMocks(page);

  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Uncached Player");
  await page.getByRole("button", { name: "検索欄をクリア" }).click();
  await expect(searchInput).toHaveValue("");
  await page.clock.fastForward(400);

  expect(searchQueries).toEqual([]);
});

test("候補をキーボードで選択するとプロフィールと分析結果を表示する", async ({
  page,
}) => {
  const { searchQueries, requests } = await installSuccessfulApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Aoi");
  const playerOption = page.getByRole("option", { name: /Aoi Player/ });
  await expect(playerOption).toContainText("JP · #1");
  await expect.poll(() => searchQueries).toEqual(["Aoi"]);

  await searchInput.press("ArrowDown");
  await searchInput.press("Enter");
  await expect(searchInput).toHaveValue("Aoi Player");

  const profile = page.getByRole("region", {
    name: "Aoi Player のプレイヤープロフィール",
  });
  await expect(profile).toBeVisible();
  await expect(profile).toContainText("#1");
  await expect(profile).toContainText("12,345.00");
  await expect(profile).toContainText("95.50%");
  await expect(profile).toContainText("20.00 PP");
  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();
  expect(searchQueries).toEqual(["Aoi"]);
  expect(requests).toContain("/api/v2/players/player-1");
  expect(requests).toContain("/api/v2/players/player-1/scores?page=1&limit=100&sort=top");
  expect(requests).toContain(
    "/api/v2/players/player-1/scores/hash/unplayed-map-hash/Standard/4",
  );

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
  await expect(
    improvementCard.getByRole("link", { name: "Played Map" }),
  ).toHaveAttribute("href", "https://scoresaber.com/leaderboard/101");

  const improvementTab = page.getByRole("tab", {
    name: "スコア更新候補 (1)",
  });
  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (1)",
  });
  await expect(improvementTab).toHaveAttribute("aria-selected", "true");
  await unplayedTab.click();
  await expect(unplayedTab).toHaveAttribute("aria-selected", "true");
  await expect(improvementTab).toHaveAttribute("aria-selected", "false");
  await expect(recommendationCards).toHaveCount(1);
  const unplayedCard = recommendationCards.first();
  await expect(unplayedCard).toContainText("Unplayed Map");
  await expect(unplayedCard).toContainText("未プレイ");
  await expect(unplayedCard).toContainText("周辺最高: 1,000,000");
  await expect(unplayedCard).toContainText("Mira Player · #2");
  await expect(unplayedCard).not.toContainText("自分:");
  await expect(
    unplayedCard.getByRole("link", { name: "Unplayed Map" }),
  ).toHaveAttribute("href", "https://scoresaber.com/leaderboard/202");

  await improvementTab.click();
  await expect(improvementTab).toHaveAttribute("aria-selected", "true");
  await expect(recommendationCards.first()).toContainText("Played Map");
});

test("検索欄をクリアして別のプレイヤーを選択する", async ({ page }) => {
  const { searchQueries } = await installSuccessfulApiMocks(page);

  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });

  await searchInput.fill("Aoi");
  const aoiOption = page.getByRole("option", { name: /Aoi Player/ });
  await expect(aoiOption).toBeVisible();
  await aoiOption.click();
  await expect(searchInput).toHaveValue("Aoi Player");
  await expect(
    page.getByRole("region", { name: "Aoi Player のプレイヤープロフィール" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "検索欄をクリア" }).click();
  await expect(searchInput).toHaveValue("");
  await expect(searchInput).toBeFocused();
  await expect(
    page.getByRole("region", { name: "Aoi Player のプレイヤープロフィール" }),
  ).toBeVisible();
  expect(searchQueries).toEqual(["Aoi"]);

  await searchInput.fill("Mira");
  const nextPlayerOption = page.getByRole("option", { name: /Mira Player/ });
  await expect(nextPlayerOption).toContainText("JP · #2");
  await expect(
    page.getByRole("option", { name: /Aoi Player/ }),
  ).toHaveCount(0);
  await nextPlayerOption.click();
  await expect(searchInput).toHaveValue("Mira Player");
  await expect(
    page.getByRole("region", { name: "Aoi Player のプレイヤープロフィール" }),
  ).toHaveCount(0);
  const miraProfile = page.getByRole("region", {
    name: "Mira Player のプレイヤープロフィール",
  });
  await expect(miraProfile).toBeVisible();
  await expect(miraProfile).toContainText("#2");
  await expect(page.getByText("分析完了", { exact: true })).toBeVisible();
  await expect.poll(() => searchQueries).toEqual(["Aoi", "Mira"]);
});
