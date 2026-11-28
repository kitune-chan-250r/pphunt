import {
  expect,
  test,
  type Download,
  type Page,
  type Route,
} from "@playwright/test";
import type { PlaylistFile } from "../../src/feature/beatlist/types/beatlist";
import type {
  Leaderboard,
  PaginatedResponse,
  PlayerProfile,
  PlayerScoreEntry,
  RankedPlayer,
  Score,
} from "../../src/feature/scoresaber/types/ScoreSaber";
import { readFile } from "node:fs/promises";

/**
 * feature/beatlist（.bplist 書き出し機能）の E2E テスト。
 *
 * 書き出しボタンは「譜面のおすすめ」分析結果（RecommendationResults）の中に
 * 埋め込まれているため、ScoreSaber API をモックして分析を完了させた状態で
 * プレイリスト出力の挙動を検証する。
 */

// BeatSaver のキー解決を絡めるため、bsid を持つ譜面・持たない譜面を混在させる。
const PLAYED_HASH = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const UNPLAYED_HASH = "0f1e2d3c4b5a69788796a5b4c3d2e1f0a1b2c3d4";
const RESOLVED_HASH = "9f8e7d6c5b4a3210fedcba9876543210123456ab";
const PLAYED_BSID = "1234abcd-5678-90ab-cdef-1234567890ab";
const RESOLVED_BEATSAVER_KEY = "7777";

const targetPlayer = makePlayer("player-1", "Aoi Player", 1, 10);
const competitor = makePlayer("player-2", "Mira Player", 2);

const playedMap = makeLeaderboard(101, PLAYED_HASH, "Played Map", PLAYED_BSID);
const unplayedMap = makeLeaderboard(202, UNPLAYED_HASH, "Unplayed Map", null);
const resolvedMap = makeLeaderboard(303, RESOLVED_HASH, "Resolved Map", null);

const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/** ScoreSaber の hash 検索を譜面単位で引くためのキー */
const hashKey = (hash: string, gameMode: string, difficulty: number) =>
  `${hash.toLowerCase()}/${gameMode}/${difficulty}`;

function makePlayer(
  id: string,
  name: string,
  rank: number,
  plusOnePP: number | null = 10,
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
      totalPP: 12_345,
      plusOnePP,
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
  bsid: string | null,
): Leaderboard {
  return {
    id,
    map: {
      id,
      hash,
      bsid,
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

interface InstallMocksOptions {
  /** 対象プレイヤーが既にスコアを持つ譜面（未プレイ候補から除外される） */
  targetScores: PlayerScoreEntry[];
  /** 周辺プレイヤーのスコア（候補譜面の供給元） */
  competitorScores: PlayerScoreEntry[];
  /** BeatSaver の /maps/hash/{hash} に対する応答。省略すると 404 になる */
  beatsaverResponses?: Record<string, { status: number; body: unknown }>;
  /** BeatSaver 応答をここで解決するまで保留するゲート */
  beatsaverGate?: Promise<void>;
}

interface MockHandles {
  /** BeatSaver プロキシへ飛んだリクエストのパス一覧 */
  beatsaverRequests: string[];
}

/**
 * ScoreSaber / BeatSaver の両プロキシをモックする。
 * 分析が完了し、書き出しボタンが有効になるための下準備をまとめて行う。
 */
async function installApiMocks(
  page: Page,
  options: InstallMocksOptions,
): Promise<MockHandles> {
  const beatsaverRequests: string[] = [];
  const {
    targetScores,
    competitorScores,
    beatsaverResponses = {},
    beatsaverGate,
  } = options;

  // 対象プレイヤーが持つスコアを「ハッシュ + ゲームモード + 難易度」で引けるようにする
  const scoresByHashKey = new Map<string, Score>(
    targetScores.map((entry) => [
      hashKey(
        entry.leaderboard.map.hash,
        entry.leaderboard.difficulty.gameMode,
        entry.leaderboard.difficulty.difficulty,
      ),
      entry.score,
    ]),
  );

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

    // 周辺順位プレイヤーの取得（page / limit / sort=rank）
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

    // 未プレイ判定: 対象プレイヤーが持っていない譜面は 404 を返す
    const hashPath = pathname.match(
      /^\/api\/v2\/players\/([^/]+)\/scores\/hash\/([^/]+)\/([^/]+)\/(\d+)$/,
    );
    if (hashPath) {
      const [, playerId, hash, gameMode, difficulty] = hashPath;
      const score =
        playerId === targetPlayer.id
          ? scoresByHashKey.get(hashKey(hash, gameMode, Number(difficulty)))
          : undefined;
      if (!score) {
        return fulfillJson(route, { error: "No score found" }, 404);
      }
      return fulfillJson(route, score);
    }

    return fulfillJson(
      route,
      { error: `Unexpected API request: ${pathname}` },
      500,
    );
  });

  await page.route("**/api/beatsaver/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/api\/beatsaver/, "");
    beatsaverRequests.push(`${pathname}${url.search}`);

    if (beatsaverGate) await beatsaverGate;

    const response = beatsaverResponses[pathname];
    if (!response) {
      return fulfillJson(route, { error: "Not found" }, 404);
    }
    return fulfillJson(route, response.body, response.status);
  });

  return { beatsaverRequests };
}

/** 既定の候補構成: 更新候補 1 譜面 / 未プレイ候補 2 譜面 */
const defaultTargetScores: PlayerScoreEntry[] = [
  {
    leaderboard: playedMap,
    score: makeScore(targetPlayer, 900_000, 12),
  },
];

const defaultCompetitorScores: PlayerScoreEntry[] = [
  {
    leaderboard: playedMap,
    score: makeScore(competitor, 950_000, 14),
  },
  {
    leaderboard: unplayedMap,
    score: makeScore(competitor, 1_000_000, 25),
  },
  {
    leaderboard: resolvedMap,
    score: makeScore(competitor, 980_000, 20),
  },
];

/** BeatSaver 側で解決できる譜面の応答（maps 配列の形） */
const resolvedBeatSaverResponse = {
  status: 200,
  body: {
    maps: [
      {
        key: RESOLVED_BEATSAVER_KEY,
        downloadUrl: "",
        versions: {
          "1.0.0": { key: RESOLVED_BEATSAVER_KEY, hash: RESOLVED_HASH },
        },
      },
    ],
  },
};

/** 未プレイ候補の譜面も BeatSaver で解決できる場合の応答 */
const unplayedBeatSaverResponse = {
  status: 200,
  body: {
    maps: [
      {
        key: "4321",
        downloadUrl: "",
        versions: {
          "1.0.0": { key: "4321", hash: UNPLAYED_HASH },
        },
      },
    ],
  },
};

/** 未プレイ候補 2 譜面とも BeatSaver で解決できる場合の応答一覧 */
const allBeatSaverResponses = {
  [`/maps/hash/${UNPLAYED_HASH}`]: unplayedBeatSaverResponse,
  [`/maps/hash/${RESOLVED_HASH}`]: resolvedBeatSaverResponse,
};

/**
 * プレイヤーを検索して選択し、譜面分析が完了するまで待つ。
 * `language` を指定すると表示言語を切り替えてから操作する（既定は日本語）。
 */
async function selectPlayerAndAwaitAnalysis(
  page: Page,
  language: "ja" | "en" = "ja",
) {
  await page.goto("/");
  if (language !== "ja") {
    // 明示選択はブラウザ言語より優先されるため、保存値を注入して再読み込みする。
    await page.evaluate((lng) => {
      window.localStorage.setItem("pphunt-language", lng);
    }, language);
    await page.reload();
  }
  const searchInput = page.getByRole("combobox", {
    name: /検索するプレイヤー名|Search players/,
  });
  await searchInput.fill("Aoi");
  const playerOption = page.getByRole("option", { name: /Aoi Player/ });
  await expect(playerOption).toBeVisible();
  await playerOption.click();
  await expect(
    page.getByText(/分析完了|Analysis complete/, { exact: true }),
  ).toBeVisible();
}

const exportButton = (page: Page) =>
  page.getByRole("button", {
    name: /表示中の候補をBeat Saberプレイリストとしてダウンロード|Download visible maps as a Beat Saber playlist/,
  });

/** 書き出しボタンを押してダウンロードイベントを取得する */
async function clickExport(page: Page): Promise<Download> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportButton(page).click(),
  ]);
  return download;
}

/** 並行照会順に依存しない比較をするために整列する */
const sortedRequests = (requests: string[]) => [...requests].sort();

/** ダウンロードされた .bplist を JSON として読み出す */
async function readPlaylist(download: Download): Promise<PlaylistFile> {
  const path = await download.path();
  if (!path) {
    throw new Error("ダウンロードファイルを取得できませんでした");
  }
  return JSON.parse(await readFile(path, "utf8")) as PlaylistFile;
}

test("スコア更新候補を .bplist としてダウンロードできる", async ({ page }) => {
  const { beatsaverRequests } = await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page);

  const button = exportButton(page);
  await expect(button).toBeEnabled();
  await expect(button).toContainText("書き出す");
  await expect(button).toContainText(".bplist");

  const download = await clickExport(page);

  // プレイヤー名とタブ名を含むファイル名で保存される
  expect(download.suggestedFilename()).toContain("スコア更新候補");
  expect(download.suggestedFilename()).toMatch(/\.bplist$/);

  const playlist = await readPlaylist(download);
  expect(playlist.playlistTitle).toBe("PPHunt Aoi Player スコア更新候補");
  expect(playlist.playlistAuthor).toBe("PPHunt");
  expect(playlist.playlistDescription).toBe(
    "PPHuntで生成したプレイリスト（スコア更新候補 / 1譜面）",
  );

  // ScoreSaber の bsid が BeatSaver Key そのものなので、追加照会をしない
  expect(beatsaverRequests).toEqual([]);
  expect(playlist.songs).toEqual([
    {
      hash: PLAYED_HASH,
      key: PLAYED_BSID,
      levelid: `custom_level_${PLAYED_HASH}`,
      difficulties: [{ characteristic: "Standard", name: "Expert" }],
    },
  ]);

  // 正常に書き出せた場合は警告を出さない
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(exportButton(page)).toContainText("書き出す");
});

test("未プレイ・PP候補タブの候補を書き出す", async ({ page }) => {
  const { beatsaverRequests } = await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
    beatsaverResponses: allBeatSaverResponses,
  });

  await selectPlayerAndAwaitAnalysis(page);

  const unplayedTab = page.getByRole("tab", {
    name: "未プレイ・PP候補 (2)",
  });
  await expect(unplayedTab).toHaveAttribute("aria-selected", "false");
  await unplayedTab.click();
  await expect(unplayedTab).toHaveAttribute("aria-selected", "true");

  const download = await clickExport(page);
  expect(download.suggestedFilename()).toContain("未プレイ・PP候補");

  const playlist = await readPlaylist(download);
  expect(playlist.playlistTitle).toBe("PPHunt Aoi Player 未プレイ・PP候補");
  expect(playlist.playlistDescription).toBe(
    "PPHuntで生成したプレイリスト（未プレイ・PP候補 / 2譜面）",
  );

  // 表示中のタブだけを出力対象にする（更新候補の譜面は含まれない）
  expect(playlist.songs.map((song) => song.hash)).toEqual([
    UNPLAYED_HASH,
    RESOLVED_HASH,
  ]);
  expect(playlist.songs.map((song) => song.hash)).not.toContain(PLAYED_HASH);

  // bsid が無い譜面は BeatSaver を参照して key を補完する
  expect(sortedRequests(beatsaverRequests)).toEqual(
    sortedRequests([
      `/maps/hash/${UNPLAYED_HASH}`,
      `/maps/hash/${RESOLVED_HASH}`,
    ]),
  );
  expect(playlist.songs.find((song) => song.hash === RESOLVED_HASH)?.key).toBe(
    RESOLVED_BEATSAVER_KEY,
  );
  expect(playlist.songs.find((song) => song.hash === UNPLAYED_HASH)?.key).toBe(
    "4321",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("bsid が無い譜面は BeatSaver でキーを解決して書き出す", async ({
  page,
}) => {
  const { beatsaverRequests } = await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
    beatsaverResponses: allBeatSaverResponses,
  });

  await selectPlayerAndAwaitAnalysis(page);
  await page.getByRole("tab", { name: "未プレイ・PP候補 (2)" }).click();

  const download = await clickExport(page);
  const playlist = await readPlaylist(download);

  // BeatSaver Key を解決できた譜面は key が付き、所持していないプレイヤーでも DL できる
  expect(sortedRequests(beatsaverRequests)).toEqual(
    sortedRequests([
      `/maps/hash/${UNPLAYED_HASH}`,
      `/maps/hash/${RESOLVED_HASH}`,
    ]),
  );
  expect(playlist.songs.map((song) => song.key)).toEqual([
    "4321",
    RESOLVED_BEATSAVER_KEY,
  ]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("BeatSaver で解決できない譜面があっても警告付きで書き出す", async ({
  page,
}) => {
  const { beatsaverRequests } = await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
    // 両方の譜面で BeatSaver が 404 を返す
    beatsaverResponses: {},
  });

  await selectPlayerAndAwaitAnalysis(page);
  await page.getByRole("tab", { name: "未プレイ・PP候補 (2)" }).click();

  const download = await clickExport(page);
  const playlist = await readPlaylist(download);

  // キーを解決できなくても hash と levelid だけで出力する
  expect(playlist.songs).toHaveLength(2);
  expect(playlist.songs.every((song) => song.key === undefined)).toBe(true);
  expect(playlist.songs.map((song) => song.levelid)).toEqual([
    `custom_level_${UNPLAYED_HASH}`,
    `custom_level_${RESOLVED_HASH}`,
  ]);
  expect(sortedRequests(beatsaverRequests)).toEqual(
    sortedRequests([
      `/maps/hash/${UNPLAYED_HASH}`,
      `/maps/hash/${RESOLVED_HASH}`,
    ]),
  );

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("2曲を出力しました。");
  await expect(alert).toContainText(
    "BeatSaver Keyを解決できなかったため、所持している譜面のみ再生できます。",
  );

  // 警告は閉じられる
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(alert).toHaveCount(0);
});

test("書き出し中は進行状況を表示し、完了後は元の表示へ戻る", async ({
  page,
}) => {
  let releaseBeatSaver!: () => void;
  const beatsaverGate = new Promise<void>((resolve) => {
    releaseBeatSaver = resolve;
  });

  await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
    beatsaverResponses: allBeatSaverResponses,
    beatsaverGate,
  });

  await selectPlayerAndAwaitAnalysis(page);
  await page.getByRole("tab", { name: "未プレイ・PP候補 (2)" }).click();

  const downloadPromise = page.waitForEvent("download");
  await exportButton(page).click();

  // 照会中は進行状況（解決済み/全体）をボタンに表示する
  const progressButton = page.getByRole("button", {
    name: "BeatSaverを照会中 0/2",
  });
  await expect(progressButton).toBeVisible();
  await expect(progressButton).toContainText("準備中");
  await expect(progressButton).toBeDisabled();

  releaseBeatSaver();
  await downloadPromise;

  // ダウンロード発火後は「保存中」表示に切り替わり、連打防止のため無効になる
  const savingButton = page.getByRole("button", { name: "プレイリストを保存中" });
  await expect(savingButton).toBeVisible();
  await expect(savingButton).toContainText("保存中");
  await expect(savingButton).toBeDisabled();

  // 受け渡しが終わると「✓ 出力済み」のフィードバックが表示される
  await expect(exportButton(page)).toContainText("出力済み");
  await expect(exportButton(page)).toBeEnabled();

  // フィードバックが消えると元のラベルへ戻る
  await expect(exportButton(page)).toContainText("書き出す");
  await expect(
    page.getByRole("button", { name: "BeatSaverを照会中 0/2" }),
  ).toHaveCount(0);
});

test("候補が0件のタブでは書き出しボタンが無効になる", async ({ page }) => {
  // 対象プレイヤーが周辺プレイヤーの全譜面をプレイ済み → 未プレイ候補は0件
  await installApiMocks(page, {
    targetScores: [
      {
        leaderboard: playedMap,
        score: makeScore(targetPlayer, 900_000, 12),
      },
      {
        leaderboard: unplayedMap,
        score: makeScore(targetPlayer, 1_000_000, 25),
      },
      {
        leaderboard: resolvedMap,
        score: makeScore(targetPlayer, 990_000, 20),
      },
    ],
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page);

  await page.getByRole("tab", { name: "未プレイ・PP候補 (0)" }).click();
  await expect(
    page.getByText("条件に合う未プレイ譜面は見つかりませんでした。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(exportButton(page)).toBeDisabled();

  // 候補があるタブに戻ると再度書き出せる
  await page.getByRole("tab", { name: "スコア更新候補 (1)" }).click();
  await expect(exportButton(page)).toBeEnabled();
  const download = await clickExport(page);
  const playlist = await readPlaylist(download);
  expect(playlist.songs.map((song) => song.hash)).toEqual([PLAYED_HASH]);
});

test("同一譜面の複数難易度は1曲にまとめて書き出す", async ({ page }) => {
  // 同じハッシュの別難易度（Expert+）を候補に混ぜる
  const expertPlusMap = makeLeaderboard(
    404,
    PLAYED_HASH,
    "Played Map",
    PLAYED_BSID,
  );
  expertPlusMap.difficulty = {
    id: 404,
    difficulty: 5,
    rawDifficulty: "ExpertPlus",
    gameMode: "Standard",
  };

  await installApiMocks(page, {
    // 同じハッシュの Expert / ExpertPlus 両方にスコアを持つ対象プレイヤー
    targetScores: [
      {
        leaderboard: playedMap,
        score: makeScore(targetPlayer, 900_000, 12),
      },
      {
        leaderboard: expertPlusMap,
        score: makeScore(targetPlayer, 900_000, 16),
      },
    ],
    competitorScores: [
      {
        leaderboard: playedMap,
        score: makeScore(competitor, 950_000, 14),
      },
      {
        leaderboard: expertPlusMap,
        score: makeScore(competitor, 970_000, 18),
      },
    ],
  });

  await selectPlayerAndAwaitAnalysis(page);

  const download = await clickExport(page);
  const playlist = await readPlaylist(download);

  // ハッシュ単位で重複排除され、難易度だけが集約される
  expect(playlist.songs).toHaveLength(1);
  expect(playlist.songs[0]?.hash).toBe(PLAYED_HASH);
  expect(
    (playlist.songs[0]?.difficulties ?? [])
      .map((difficulty) => `${difficulty.characteristic}/${difficulty.name}`)
      .sort(),
  ).toEqual(["Standard/Expert", "Standard/ExpertPlus"]);
});

/**
 * 初回書き出し後に同じ候補を再書き出しするときの回帰テスト。
 *
 * 実ブラウザでは、`<a download>` のクリックが非同期処理のあとに遅れて発火すると
 * 「ユーザー操作を伴わない連続ダウンロード」として無言でブロックされ、コンソールに
 * 何も出力されない。BeatSaver キーをセッション内でキャッシュすれば、2 回目以降の
 * 書き出しはネットワークを待たずに即座に発火するため、この問題を防げる。
 */
test("同じ候補を2回以上書き出すとき、BeatSaver を再照会せず即座にダウンロードできる", async ({
  page,
}) => {
  const { beatsaverRequests } = await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
    beatsaverResponses: allBeatSaverResponses,
  });

  await selectPlayerAndAwaitAnalysis(page);
  await page.getByRole("tab", { name: "未プレイ・PP候補 (2)" }).click();

  // 1 回目: bsid が無い 2 譜面を BeatSaver で解決する
  const first = await clickExport(page);
  expect(sortedRequests(beatsaverRequests)).toEqual(
    sortedRequests([
      `/maps/hash/${UNPLAYED_HASH}`,
      `/maps/hash/${RESOLVED_HASH}`,
    ]),
  );
  const firstPlaylist = await readPlaylist(first);

  // 2 回目: 同じ候補なので再照会しない（キャッシュ済みキーで即出力）
  const second = await clickExport(page);
  expect(beatsaverRequests).toHaveLength(2);
  const secondPlaylist = await readPlaylist(second);
  expect(secondPlaylist.songs.map((song) => song.key)).toEqual(
    firstPlaylist.songs.map((song) => song.key),
  );
  expect(
    secondPlaylist.songs.find((song) => song.hash === RESOLVED_HASH)?.key,
  ).toBe(RESOLVED_BEATSAVER_KEY);

  // 3 回目も同様に再照会ゼロでダウンロードできる
  const third = await clickExport(page);
  expect(beatsaverRequests).toHaveLength(2);
  const thirdPlaylist = await readPlaylist(third);
  expect(thirdPlaylist.songs).toEqual(firstPlaylist.songs);

  await expect(page.getByRole("alert")).toHaveCount(0);
});

/**
 * `URL.revokeObjectURL` をクリックと同時（同期）に呼ぶと、実ブラウザでは
 * ダウンロードが中断されることがある（コンソールには何も出ない）。
 * オブジェクト URL はダウンロード開始後に遅延して解放されること。
 */
test("プレイリストのオブジェクトURLはクリック後、遅延して解放される", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const trace = { createAt: null, clickAt: null, revokeAt: null };
    (
      window as unknown as {
        __urlTrace: {
          createAt: number | null;
          clickAt: number | null;
          revokeAt: number | null;
        };
      }
    ).__urlTrace = trace;

    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      trace.createAt = performance.now();
      return originalCreate(blob);
    };
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      trace.revokeAt = performance.now();
      return originalRevoke(url);
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function patched(
      ...args: Parameters<HTMLAnchorElement["click"]>
    ) {
      trace.clickAt = performance.now();
      return originalClick.apply(this, args);
    };
  });

  await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page);
  await clickExport(page);

  // 解放は遅延実行されるため、記録されるまで待つ
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          __urlTrace: { revokeAt: number | null };
        }
      ).__urlTrace.revokeAt !== null,
    undefined,
    { timeout: 10_000 },
  );

  const trace = await page.evaluate(() => {
    const t = (
      window as unknown as {
        __urlTrace: {
          createAt: number | null;
          clickAt: number | null;
          revokeAt: number | null;
        };
      }
    ).__urlTrace;
    return { createAt: t.createAt, clickAt: t.clickAt, revokeAt: t.revokeAt };
  });

  expect(trace.createAt).not.toBeNull();
  expect(trace.clickAt).not.toBeNull();
  expect(trace.revokeAt).not.toBeNull();
  // クリック直後の同期解放ではなく、ブラウザがダウンロードを開始できるだけの
  // 猶予をもって解放されること。
  expect((trace.revokeAt ?? 0) - (trace.clickAt ?? 0)).toBeGreaterThanOrEqual(
    50,
  );
});

/**
 * ダウンロード発火後の受け渡し中はボタンを無効化し、連打による重複ダウンロード
 * を防ぐことのテスト。実ブラウザでは連続する自動ダウンロードが無言でブロック
 * されるため、発火後は一定時間クリックを受け付けない仕様になっている。
 */
test("ダウンロードの受け渡し中は書き出しボタンが無効になり、連打しても重複ダウンロードしない", async ({
  page,
}) => {
  await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page);

  const first = await clickExport(page);
  expect(first.suggestedFilename()).toMatch(/\.bplist$/);

  // ダウンロード発火直後は「保存中」表示に切り替わり、ボタンは無効になる
  const savingButton = page.getByRole("button", {
    name: "プレイリストを保存中",
  });
  await expect(savingButton).toBeVisible();
  await expect(savingButton).toBeDisabled();

  // 無効中に強制クリックしても（ブラウザがクリックを吸収して）2回目は発火しない
  await savingButton.click({ force: true }).catch(() => undefined);
  let duplicate: Download | null = null;
  try {
    duplicate = await page.waitForEvent("download", { timeout: 2_000 });
  } catch {
    // 期待どおり: 受け渡し中はダウンロードが発生しない
  }
  expect(duplicate).toBeNull();

  // 受け渡しとフィードバックが終わると再度書き出せる
  await expect(exportButton(page)).toBeEnabled();
  const second = await clickExport(page);
  expect(second.suggestedFilename()).toMatch(/\.bplist$/);
});

/**
 * 書き出し完了後、「✓ 出力済み」のフィードバックが一時的に表示され、
 * もとの「書き出す」ラベルへ戻ることのテスト。
 */
test("書き出し完了後に『出力済み』のフィードバックが一時的に表示される", async ({
  page,
}) => {
  await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page);

  await clickExport(page);

  // 保存中フェーズを経て「出力済み」が表示される
  await expect(exportButton(page)).toContainText("出力済み");
  await expect(exportButton(page)).toBeEnabled();

  // フィードバックは一定時間だけ表示され、やがて元のラベルへ戻る
  await expect(exportButton(page)).toContainText("書き出す");
  await expect(exportButton(page)).not.toContainText("出力済み");
});

/**
 * 英語表示に切り替えた場合も、書き出しの各フェーズ（保存中・出力済み）が
 * 英語ラベルで表示され、連打防止の無効化が同じように働くことのテスト。
 */
test("英語表示でも書き出しの『Saving…』『Saved』フィードバックが表示される", async ({
  page,
}) => {
  await installApiMocks(page, {
    targetScores: defaultTargetScores,
    competitorScores: defaultCompetitorScores,
  });

  await selectPlayerAndAwaitAnalysis(page, "en");

  const downloadPromise = page.waitForEvent("download");
  await exportButton(page).click();
  await downloadPromise;

  // ダウンロード発火後は英語の「Saving…」表示になり、無効化する
  const savingButton = page.getByRole("button", { name: "Saving playlist" });
  await expect(savingButton).toBeVisible();
  await expect(savingButton).toContainText("Saving…");
  await expect(savingButton).toBeDisabled();

  // 受け渡し完了後は「Saved」、やがて英語の通常ラベル「Export」へ戻る
  await expect(exportButton(page)).toContainText("Saved");
  await expect(exportButton(page)).toContainText("Export");
});
