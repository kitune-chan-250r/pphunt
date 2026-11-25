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
 * RecommendMap v3（DESIGN_V3.md）の E2E:
 * - 並び順が出現人数ではなく鮮度＋期待 ΔPP のブレンドスコアで決まること
 *   （2人が古くに触れた譜面より、1人が最近触れた譜面が上に来る。
 *   本フィクスチャでは両譜面が同 stars のため期待 ΔPP は同点になり、
 *   鮮度重みの差がそのまま順位差になる）。
 * - 表示専用の予測情報（予測 +ΔPP、予測精度、「格上」タグ、直近90日人数）が
 *   カードに出ること。
 * - 分析フッターに API 呼び出し回数の概数が出ること。
 */

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const targetPlayer = makePlayer("player-1", "Target Player", 500);
const competitor1 = makePlayer("player-2", "Fresh Player", 501);
const competitor2 = makePlayer("player-3", "Old Player", 502);

const freshMap = makeLeaderboard(302, "fresh-map-hash", "Fresh Map", 5);
const oldMap = makeLeaderboard(301, "old-map-hash", "Old Map", 5);
const playedMap = makeLeaderboard(303, "played-map-hash", "Played Map", 12);
const fillerMapA = makeLeaderboard(304, "filler-a-hash", "Filler A", 10);
const fillerMapB = makeLeaderboard(305, "filler-b-hash", "Filler B", 11);

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

function makeLeaderboard(
  id: number,
  hash: string,
  songName: string,
  stars: number,
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
      stars,
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
    leaderboard: playedMap,
    score: makeScore(targetPlayer, 800_000, 10, 85, daysAgo(30)),
  },
  {
    leaderboard: fillerMapA,
    score: makeScore(targetPlayer, 850_000, 50, 88, daysAgo(60)),
  },
  {
    leaderboard: fillerMapB,
    score: makeScore(targetPlayer, 840_000, 40, 86, daysAgo(90)),
  },
];

const competitor1Scores: PlayerScoreEntry[] = [
  {
    leaderboard: freshMap,
    score: makeScore(competitor1, 965_000, 30, 96, daysAgo(5)),
  },
  {
    leaderboard: oldMap,
    score: makeScore(competitor1, 960_000, 25, 96, daysAgo(400)),
  },
  {
    leaderboard: playedMap,
    score: makeScore(competitor1, 990_000, 300, 97, daysAgo(10)),
  },
];

const competitor2Scores: PlayerScoreEntry[] = [
  {
    leaderboard: oldMap,
    score: makeScore(competitor2, 950_000, 22, 95, daysAgo(400)),
  },
];

const scoresByPlayerId = new Map<string, PlayerScoreEntry[]>([
  [targetPlayer.id, targetScores],
  [competitor1.id, competitor1Scores],
  [competitor2.id, competitor2Scores],
]);

const allPlayers = [targetPlayer, competitor1, competitor2];

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
      pathname.startsWith(
        `/api/v2/players/${targetPlayer.id}/scores/hash/`,
      )
    ) {
      // 未プレイ候補はどちらも未プレイとして 404 を返す。
      return fulfillJson(route, { error: "No score found" }, 404);
    }

    return fulfillJson(
      route,
      { error: `Unexpected API request: ${pathname}` },
      500,
    );
  });
}

test("鮮度＋ΔPPブレンドで並び、予測情報と格上タグを表示する", async ({ page }) => {
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
  await expect(
    page.getByText(/分析に使用したAPI呼び出し: 約\d+回/),
  ).toBeVisible();

  // スコア更新候補: Played Map のみ。競合者最高精度 97% は自分の予測精度を
  // 大きく上回るため「格上」タグと予測情報が出る。
  const improvementTab = page.getByRole("tab", {
    name: "スコア更新候補 (1)",
  });
  await expect(improvementTab).toHaveAttribute("aria-selected", "true");
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(1);
  const improvementCard = cards.first();
  await expect(improvementCard).toContainText("Played Map");
  await expect(improvementCard).toContainText("格上");
  await expect(improvementCard).toContainText("予測 +ΔPP（周辺最高ベース）");
  await expect(improvementCard).toContainText("予測精度（目安）");

  // 未プレイ・PP候補: 出現人数では Old Map（2人）が上だが、鮮度重みでは
  // Fresh Map（1人・5日前）が上になる（期待 ΔPP は同 stars で同点）。
  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (2)",
  });
  await unplayedTab.click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Fresh Map");
  await expect(cards.first()).toContainText("直近90日に 1人");
  await expect(cards.first()).toContainText("予測 +ΔPP（中央値ベース）");
  await expect(cards.nth(1)).toContainText("Old Map");
  await expect(cards.nth(1)).not.toContainText("直近90日に");
});
