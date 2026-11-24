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
 * feature/map-recommend アルゴリズム v2（DESIGN.md §3）の E2E テスト。
 *
 * ScoreSaber API をモックし、PP カーブと整合するフィクスチャ
 * （pp = stars × C(accuracy)）で次を検証する:
 * - 未プレイ候補が plusOnePP ではなく予測 ΔPP で推薦されること（旧方式との差）
 * - 類似プレイヤーが十分いる場合は協調推薦タグが付き、劣化表示が出ないこと
 * - 実力帯から大きく外れた譜面はクリア可能性ゲートで順位が下がること
 * - 自分のカーブから外れた低精度スコアが更新候補として出ること
 * - 類似プレイヤー不足時は劣化表示（協調推薦の無効化）が出ること
 */

const anchorC = (accuracy: number) =>
  42.11 * Math.pow(1 / (1 - accuracy) / 20, 0.545);
const ppFor = (stars: number, accuracy: number) =>
  Math.round(stars * anchorC(accuracy));
/** フィクスチャ用の「標準的な」精度カーブ（stars が上がると精度が下がる）。 */
const curveAccuracy = (stars: number) =>
  1 - Math.exp(-4.35 + 0.085 * stars + 0.0085 * stars * stars);

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

function makePlayer(
  id: string,
  name: string,
  rank: number,
  overrides: Partial<RankedPlayer["stats"]> = {},
): RankedPlayer {
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
      totalPP: 9_000,
      plusOnePP: 500,
      totalScore: "1000000",
      totalRankedScore: "1000000",
      totalPlayedLeaderboards: 40,
      totalPlayedRankedLeaderboards: 40,
      totalSubmittedPlays: 40,
      totalReplayViews: 0,
      averageAccuracy: 93,
      weightedAverageAccuracy: 93,
      completionAccuracy: 93,
      device: null,
      ...overrides,
    },
  };
}

function makeLeaderboard(id: number, stars: number, songName: string) {
  return {
    id,
    map: {
      id,
      hash: `hash-${id}`,
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
      difficulty: 5,
      rawDifficulty: "ExpertPlus",
      gameMode: "SoloStandard",
    },
    maxScore: 1_150_000,
    totalScores: 100,
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
  } satisfies Leaderboard;
}

function makeScore(
  player: RankedPlayer,
  accuracy: number,
  pp: number,
  rank = 1,
): Score {
  const modifiedScore = Math.round(accuracy * 1_150_000);
  return {
    id: modifiedScore + rank,
    rank,
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
    createdAt: "2026-10-01T00:00:00.000Z",
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

// ---- フィクスチャ構築 ----

const targetPlayer = makePlayer("player-1", "Target Player", 500);
const neighbours: RankedPlayer[] = Array.from({ length: 12 }, (_, j) =>
  makePlayer(`player-${j + 2}`, `Neighbour ${j + 1}`, 480 + j * 3, {
    totalPP: 8_600 + j * 60,
  }),
);

const targetMaps: Leaderboard[] = Array.from({ length: 40 }, (_, i) =>
  makeLeaderboard(1000 + i, 6 + ((i * 0.13) % 5.2), `Target Map ${i + 1}`),
);
const outlierMap = targetMaps[39];
const candidateGood = makeLeaderboard(2001, 9.0, "Reachable Map");
const candidateHard = makeLeaderboard(2002, 14.5, "Faraway Map");

const targetEntries: PlayerScoreEntry[] = targetMaps.map((leaderboard, i) => {
  const stars = leaderboard.realm.stars;
  const accuracy =
    leaderboard.id === outlierMap.id
      ? 0.86
      : curveAccuracy(stars) + ((i * 7) % 5 - 2) * 0.0015;
  return {
    leaderboard,
    score: makeScore(targetPlayer, accuracy, ppFor(stars, accuracy)),
  };
});
const targetScoreByMap = new Map(
  targetEntries.map((entry) => [entry.leaderboard.id, entry.score]),
);

const neighbourEntries = new Map<string, PlayerScoreEntry[]>();
for (const [j, neighbour] of neighbours.entries()) {
  const factor = 0.97 + (j % 5) * 0.006;
  const entries: PlayerScoreEntry[] = [];
  for (const [i, leaderboard] of targetMaps.entries()) {
    if ((i + j) % 8 === 0) continue;
    const base = targetScoreByMap.get(leaderboard.id);
    if (!base) continue;
    const accuracy = Math.min(0.995, base.accuracy * factor);
    entries.push({
      leaderboard,
      score: makeScore(
        neighbour,
        accuracy,
        ppFor(leaderboard.realm.stars, accuracy),
      ),
    });
  }
  const goodAccuracy = 0.945 - j * 0.0005;
  entries.push({
    leaderboard: candidateGood,
    score: makeScore(neighbour, goodAccuracy, ppFor(9.0, goodAccuracy)),
  });
  entries.push({
    leaderboard: candidateHard,
    score: makeScore(neighbour, 0.9, ppFor(14.5, 0.9)),
  });
  neighbourEntries.set(neighbour.id, entries);
}

const allPlayers = [targetPlayer, ...neighbours];
const entriesByPlayer = new Map<string, PlayerScoreEntry[]>([
  [targetPlayer.id, targetEntries],
  ...neighbourEntries,
]);

async function installMocks(page: Page, playerList: RankedPlayer[]) {
  await page.route("**/api/scoresaber/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/scoresaber/, "");
    const { searchParams } = url;

    if (pathname === "/api/v2/players" && searchParams.has("search")) {
      return fulfillJson(route, makePaginatedResponse([targetPlayer]));
    }
    if (pathname === "/api/v2/players" && searchParams.has("page")) {
      return fulfillJson(route, makePaginatedResponse(playerList));
    }

    const playerPath = pathname.match(/^\/api\/v2\/players\/([^/]+)$/);
    if (playerPath) {
      const player = allPlayers.find(({ id }) => id === playerPath[1]);
      if (!player) return fulfillJson(route, { error: "not found" }, 404);
      return fulfillJson(route, player satisfies PlayerProfile);
    }

    const scoresPath = pathname.match(/^\/api\/v2\/players\/([^/]+)\/scores$/);
    if (scoresPath) {
      return fulfillJson(
        route,
        makePaginatedResponse(entriesByPlayer.get(scoresPath[1]) ?? []),
      );
    }

    const lbScoresPath = pathname.match(
      /^\/api\/v2\/leaderboards\/(\d+)\/scores$/,
    );
    if (lbScoresPath) {
      const leaderboardId = Number(lbScoresPath[1]);
      const flat: Score[] = [];
      for (const entries of entriesByPlayer.values()) {
        for (const entry of entries) {
          if (entry.leaderboard.id === leaderboardId) flat.push(entry.score);
        }
      }
      flat.sort((a, b) => b.modifiedScore - a.modifiedScore);
      flat.forEach((score, index) => {
        score.rank = index + 1;
      });
      return fulfillJson(route, makePaginatedResponse(flat));
    }

    const hashPath = pathname.match(
      /^\/api\/v2\/players\/([^/]+)\/scores\/hash\/([^/]+)\/([^/]+)\/(\d+)$/,
    );
    if (hashPath) {
      const [, playerId, hash] = hashPath;
      const entry = (entriesByPlayer.get(playerId) ?? []).find(
        (candidate) => candidate.leaderboard.map.hash === hash,
      );
      if (!entry) return fulfillJson(route, { error: "No score" }, 404);
      return fulfillJson(route, entry.score);
    }

    return fulfillJson(route, { error: `Unexpected: ${pathname}` }, 500);
  });
}

async function selectTargetPlayer(page: Page) {
  await page.goto("/");
  const searchInput = page.getByRole("combobox", {
    name: "検索するプレイヤー名",
  });
  await searchInput.fill("Target");
  const option = page.getByRole("option", { name: /Target Player/ });
  await expect(option).toBeVisible();
  await option.click();
  // 分析は API 呼び出し回数が多く、クライアント側の最小リクエスト間隔
  // （300ms）の累積だけで10秒を超えるため、完了待ちは長めに取る。
  await expect(page.getByText("分析完了", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

test("予測ΔPPで未プレイ候補を推薦し、協調推薦タグと順位付けが機能する", async ({
  page,
}) => {
  await installMocks(page, allPlayers);
  await selectTargetPlayer(page);

  // 協調推薦が有効なため劣化表示は出ない
  await expect(
    page.getByText("似たプレイスタイルのプレイヤーが不足しているため"),
  ).toHaveCount(0);

  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (2)",
  });
  await unplayedTab.click();

  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);

  // 実力帯内の譜面が先頭。plusOnePP=500 を競合者 PP（約360）が下回っても
  // 旧方式の閾値ではなく予測 ΔPP で推薦される。
  const firstCard = cards.first();
  await expect(firstCard).toContainText("Reachable Map");
  await expect(firstCard).toContainText("予測 PP 増分");
  await expect(firstCard).toContainText("似たプレイヤー人気");

  // 実力帯から大きく外れた譜面はゲートで後方に回る
  const secondCard = cards.nth(1);
  await expect(secondCard).toContainText("Faraway Map");
});

test("自分のカーブから外れたスコアが更新候補として予測表示される", async ({
  page,
}) => {
  await installMocks(page, allPlayers);
  await selectTargetPlayer(page);

  const improvementsTab = page.getByRole("tab", {
    name: /スコア更新候補 \(\d+\)/,
  });
  await expect(improvementsTab).toHaveAttribute("aria-selected", "true");

  const cards = page.getByRole("article");
  await expect(cards.first()).toContainText("予測 PP 増分");
  await expect(cards.first()).toContainText("予測精度");

  // カーブから大きく外れた低精度スコア（Target Map 40、精度0.86）も
  // 「本来出せる精度」で再評価され、更新候補に入る
  const outlierCard = cards.filter({ hasText: "Target Map 40" });
  await expect(outlierCard).toHaveCount(1);
  await expect(outlierCard).toContainText("予測 PP 増分");
});

test("類似プレイヤーが不足すると協調推薦の劣化が明示される", async ({
  page,
}) => {
  // 近傍が1人だけの構成では協調推薦は無効化される
  await installMocks(page, [targetPlayer, neighbours[0]]);
  await selectTargetPlayer(page);

  await expect(
    page.getByText("似たプレイスタイルのプレイヤーが不足しているため"),
  ).toBeVisible();

  // それでも実力予測のみで未プレイ候補は推薦される
  const unplayedTab = page.getByRole("tab", {
    name: /未プレイ・PP候補 \(\d+\)/,
  });
  await unplayedTab.click();
  const cards = page.getByRole("article");
  await expect(cards.first()).toContainText("予測 PP 増分");
  await expect(cards.first()).not.toContainText("似たプレイヤー人気");
});
