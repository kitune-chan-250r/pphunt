/**
 * RecommendMap v3 の最小フレッシュバックテスト（DESIGN_V3.md §6）。
 *
 * 層化初回パス（stratified.test.ts）と同じサンプリング・評価定義を使い、
 * 次の3方式（+参考1方式）を比較する:
 * - (i) 本番現行: 近傍200人（ランク昇順）× top50 プール、出現人数順。
 * - (ii) v3 Phase 1: 近傍60人（ランク距離順）× top100 プール、
 *   鮮度重み付き出現順（H は層別: ランク1000まで180日、それ以外365日）。
 * - (iii) v3 + B2 ブレンド: (ii) の候補に z(fresh) + 0.5·z(期待ΔPP) で並べ替え。
 * - (ii+P3) 参考: (ii) のプールに近傍の recent100 を追加（P3 の検証用）。
 *
 * §6 の「テスト集合の定義を両タブに拡張」に対応し、候補化は
 * 未プレイ候補（競合者最高 PP ≥ plusOnePP）と更新候補（競合者最高
 * modifiedScore > 自分の学習スコア）の和集合とし、ヘッドライン指標は
 * 和集合ランキングで、タブ別指標も併せて記録する。
 *
 * 合否の目安（§6）: (ii) が (i) に対して全体 NDCG@20 で +0.01 以上、
 * かつ 1–100 層で −0.01 以上の悪化がないこと。
 *
 * 実行条件: 環境変数 BACKTEST=1 のときだけ動く。
 * 実行例: `npm run test:backtest:v3`
 *
 * データは層化実行と同じ /tmp/pphunt-backtest-cache を共有し、
 * 既取得の応答（本人・周辺ページ・近傍 top100 の一部）は再利用する。
 * HTTP 429 はリトライせず実行全体を穏当に中断し、部分結果を残す。
 * プレイヤー完了ごとに v3-progress.json へ書き出し、再開可能にする。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  fitAccuracyCurve,
  type AccuracyObservation,
} from "../../src/feature/map-recommend/lib/accuracyCurve";
import { fitPpCurve } from "../../src/feature/map-recommend/lib/ppCurve";
import { deltaPpForScore } from "../../src/feature/map-recommend/lib/ppGain";
import { halfLifeDaysForRank } from "../../src/feature/map-recommend/lib/freshness";

// ---------------------------------------------------------------------------
// 最小限の API 型（層化ハーネスと同一）
// ---------------------------------------------------------------------------

interface ApiPlayerStats {
  rank: number;
  totalPP: number;
  plusOnePP: number | null;
  averageAccuracy: number;
  totalPlayedRankedLeaderboards: number;
}

interface ApiPlayer {
  id: string;
  name: string;
  stats: ApiPlayerStats;
}

interface ApiScore {
  accuracy: number;
  pp: number;
  modifiedScore: number;
  createdAt: string;
}

interface ApiLeaderboard {
  id: number;
  realm: { stars: number };
  difficulty: { gameMode: string; rawDifficulty: string };
  map: { songName: string; songSubName: string };
}

interface ApiScoreEntry {
  score: ApiScore;
  leaderboard: ApiLeaderboard;
}

interface Paginated<T> {
  data: T[];
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const API_BASE = "https://scoresaber.com/api/v2";
const CACHE_DIR = "/tmp/pphunt-backtest-cache";
const PACE_MS = 300;
const TOP_K = 20;

/** (i) 本番現行の近傍人数と深度。 */
const PROD_NEIGHBOUR_LIMIT = 200;
const PROD_TOP_LIMIT = 50;
/** (ii) v3 の近傍人数（ランク距離順）と深度。 */
const V3_NEIGHBOUR_LIMIT = 60;
const V3_TOP_LIMIT = 100;

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(HERE, "stratified-manifest.json");
const PROGRESS_PATH = join(HERE, "v3-progress.json");
const RESULTS_PATH = join(HERE, "v3-results.json");

const STRATA = ["1-100", "101-1000", "1001-5000", "5001-20000"] as const;
type StratumLabel = (typeof STRATA)[number];

// ---------------------------------------------------------------------------
// キャッシュ付きフェッチ（層化ハーネスと同一。429 は即中断）
// ---------------------------------------------------------------------------

class RateLimitError extends Error {
  constructor(url: string) {
    super(`HTTP 429 (rate limited) for ${url}`);
    this.name = "RateLimitError";
  }
}

class OwnFetchError extends Error {
  constructor(playerId: string, cause: unknown) {
    super(
      `対象プレイヤー ${playerId} の取得に失敗した: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.name = "OwnFetchError";
  }
}

let apiCallCount = 0;
let networkCallCount = 0;
let lastNetworkAt = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * ペーシングスロットの直列化キュー。並行フェッチ時でもネットワーク
 * リクエストの開始間隔が PACE_MS を下回らないことを保証する
 * （リクエストレート自体は直列実行時と同一に保つ）。
 */
let paceChain: Promise<void> = Promise.resolve();
const acquirePaceSlot = (): Promise<void> => {
  const slot = paceChain.then(async () => {
    const wait = PACE_MS - (Date.now() - lastNetworkAt);
    if (wait > 0) await sleep(wait);
    lastNetworkAt = Date.now();
  });
  paceChain = slot.catch(() => undefined);
  return slot;
};

/** 順序を保ったまま最大 `concurrency` 並行で処理する。 */
const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  apiCallCount += 1;
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(
    CACHE_DIR,
    `${createHash("sha256").update(url).digest("hex")}.json`,
  );
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, "utf8")) as T;
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await acquirePaceSlot();
    networkCallCount += 1;
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        throw new RateLimitError(url);
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const json = (await response.json()) as T;
      writeFileSync(cachePath, JSON.stringify(json));
      return json;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      lastError = error;
      if (attempt === 0) await sleep(1_000);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`fetch failed for ${url}`);
};

const playersPageUrl = (page: number): string =>
  `${API_BASE}/players?sort=rank&limit=100&page=${page}`;
const playerUrl = (id: string): string => `${API_BASE}/players/${id}`;
const scoresUrl = (id: string, sort: "top" | "recent"): string =>
  `${API_BASE}/players/${id}/scores?sort=${sort}&limit=${sort === "top" ? V3_TOP_LIMIT : 100}`;

// ---------------------------------------------------------------------------
// 整形ヘルパー（層化ハーネスと同一）
// ---------------------------------------------------------------------------

const dedupeByMap = (entries: ApiScoreEntry[]): ApiScoreEntry[] => {
  const byMap = new Map<number, ApiScoreEntry>();
  for (const entry of entries) {
    const current = byMap.get(entry.leaderboard.id);
    if (!current || entry.score.pp > current.score.pp) {
      byMap.set(entry.leaderboard.id, entry);
    }
  }
  return [...byMap.values()];
};

const createdBefore = (entry: ApiScoreEntry, cutoffMs: number): boolean =>
  Date.parse(entry.score.createdAt) < cutoffMs;

const toObservations = (entries: ApiScoreEntry[]): AccuracyObservation[] =>
  entries
    .filter((entry) => entry.leaderboard.realm.stars > 0)
    .map((entry) => ({
      stars: entry.leaderboard.realm.stars,
      accuracy: entry.score.accuracy,
      characteristic: entry.leaderboard.difficulty.gameMode,
      createdAt: entry.score.createdAt,
    }));

const toPpSamples = (entries: ApiScoreEntry[]) =>
  entries
    .filter((entry) => entry.leaderboard.realm.stars > 0)
    .map((entry) => ({
      accuracy: entry.score.accuracy,
      pp: entry.score.pp,
      stars: entry.leaderboard.realm.stars,
    }));

// ---------------------------------------------------------------------------
// 指標（層化ハーネスと同一）
// ---------------------------------------------------------------------------

const ndcgAtK = (
  orderedGains: number[],
  allGains: number[],
  k: number,
): number => {
  const dcg = orderedGains
    .slice(0, k)
    .reduce((sum, gain, i) => sum + gain / Math.log2(i + 2), 0);
  const ideal = [...allGains].sort((a, b) => b - a).slice(0, k);
  const idcg = ideal.reduce(
    (sum, gain, i) => sum + gain / Math.log2(i + 2),
    0,
  );
  return idcg > 0 ? dcg / idcg : 0;
};

const recallAtK = (
  orderedIds: number[],
  testIds: Set<number>,
  k: number,
): number => {
  if (testIds.size === 0) return 0;
  const hits = orderedIds.slice(0, k).filter((id) => testIds.has(id)).length;
  return hits / testIds.size;
};

// ---------------------------------------------------------------------------
// 候補の内部表現
// ---------------------------------------------------------------------------

interface CandidateInfo {
  leaderboardId: number;
  stars: number;
  characteristic: string;
  /** この譜面を T 以前にプレイしていた近傍プレイヤー数。 */
  appearanceCount: number;
  /** 出現プレイヤーのうち最高の raw PP（train フィルタ済み）。 */
  competitorMaxPp: number;
  /** 出現プレイヤーのうち最高の modifiedScore（train フィルタ済み）。 */
  competitorMaxModifiedScore: number;
  /** プレイヤーごとの最新プレイ日時（鮮度計算用、train フィルタ済み）。 */
  latestPlayMsByPlayer: Map<string, number>;
  /** 鮮度重み付き出現スコア（H は対象プレイヤーの層で決まる）。 */
  freshness: number;
}

interface NeighbourFetch {
  player: ApiPlayer;
  /** top の生リスト（dedupe 前）。top50 シミュレーションに使う。 */
  rawTop: ApiScoreEntry[];
  /** recent の生リスト（P3 用）。取得しない場合は null。 */
  rawRecent: ApiScoreEntry[] | null;
}

/**
 * 近傍エントリの集合から候補母集団を構築する。
 * `selectEntries` でプレイヤーごとに使うエントリ列を切り替える
 * （top50 / top100 / top+recent）。鮮度はプレイヤー×譜面の最新日で計算する。
 */
const buildCandidates = (
  neighbours: NeighbourFetch[],
  selectEntries: (n: NeighbourFetch) => ApiScoreEntry[],
  cutoffMs: number,
  halfLifeDays: number,
  trainEntries: ApiScoreEntry[],
): CandidateInfo[] => {
  const candidates = new Map<number, CandidateInfo>();
  const ensure = (entry: ApiScoreEntry): CandidateInfo => {
    const id = entry.leaderboard.id;
    let candidate = candidates.get(id);
    if (!candidate) {
      candidate = {
        leaderboardId: id,
        stars: entry.leaderboard.realm.stars,
        characteristic: entry.leaderboard.difficulty.gameMode,
        appearanceCount: 0,
        competitorMaxPp: 0,
        competitorMaxModifiedScore: 0,
        latestPlayMsByPlayer: new Map(),
        freshness: 0,
      };
      candidates.set(id, candidate);
    }
    return candidate;
  };

  for (const neighbour of neighbours) {
    // プレイヤー×譜面で dedupe（PP 最大を候補化・競合者判定に使う）。
    const deduped = dedupeByMap(
      selectEntries(neighbour).filter((e) => createdBefore(e, cutoffMs)),
    );
    // 鮮度用に、同じ譜面の最新プレイ日時を別途追う（recent 併用時に効く）。
    const latestByMap = new Map<number, number>();
    for (const entry of selectEntries(neighbour)) {
      if (!createdBefore(entry, cutoffMs)) continue;
      const ms = Date.parse(entry.score.createdAt);
      if (!Number.isFinite(ms)) continue;
      const current = latestByMap.get(entry.leaderboard.id);
      if (current === undefined || ms > current) {
        latestByMap.set(entry.leaderboard.id, ms);
      }
    }
    for (const entry of deduped) {
      const candidate = ensure(entry);
      candidate.appearanceCount += 1;
      candidate.competitorMaxPp = Math.max(
        candidate.competitorMaxPp,
        entry.score.pp,
      );
      candidate.competitorMaxModifiedScore = Math.max(
        candidate.competitorMaxModifiedScore,
        entry.score.modifiedScore,
      );
      const latest = latestByMap.get(entry.leaderboard.id);
      if (latest !== undefined) {
        candidate.latestPlayMsByPlayer.set(neighbour.player.id, latest);
      }
    }
  }
  for (const entry of trainEntries) ensure(entry);

  const list = [...candidates.values()].filter((c) => c.stars > 0);
  for (const candidate of list) {
    let fresh = 0;
    for (const ms of candidate.latestPlayMsByPlayer.values()) {
      const ageDays = Math.max(0, (cutoffMs - ms) / 86_400_000);
      fresh += Math.pow(2, -ageDays / halfLifeDays);
    }
    candidate.freshness = fresh;
  }
  return list;
};

// ---------------------------------------------------------------------------
// 記録型
// ---------------------------------------------------------------------------

interface MethodMetrics {
  ndcg20: number;
  recall20: number;
  unplayedNdcg20: number;
  unplayedRecall20: number;
  improvementNdcg20: number;
  improvementRecall20: number;
  candidateCount: number;
  poolSize: number;
  testInUniverse: number;
  coverage: number | null;
}

interface V3PlayerRecord {
  stratum: string;
  slotIndex: number;
  player: { id: string; name: string; rank: number; totalPP: number };
  status: "ok" | "no-test-set";
  cutoffUsed: number;
  trainSize: number;
  testSize: number;
  unplayedTestSize: number;
  improvementTestSize: number;
  fetchedNeighboursProd: number;
  fetchedNeighboursV3: number;
  apiCallsForPlayer: number;
  networkCallsForPlayer: number;
  methods: Record<string, MethodMetrics> | null;
}

interface ProgressFile {
  version: 1;
  updatedAt: string;
  records: V3PlayerRecord[];
}

const writeProgress = (records: V3PlayerRecord[]): void => {
  const progress: ProgressFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records,
  };
  writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
};

const loadProgress = (): V3PlayerRecord[] => {
  if (!existsSync(PROGRESS_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) as
      | ProgressFile
      | V3PlayerRecord[];
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// プレイヤー1人の評価
// ---------------------------------------------------------------------------

const METHOD_I = "(i) 本番現行";
const METHOD_II = "(ii) v3 Phase 1";
const METHOD_III = "(iii) v3 + B2ブレンド";
const METHOD_II_P3 = "(ii+P3) v3 + 近傍recent";
const METHOD_NAMES = [METHOD_I, METHOD_II, METHOD_III, METHOD_II_P3];

const evaluatePlayer = async (
  target: { id: string; name: string; rank: number },
  stratum: StratumLabel,
  slotIndex: number,
): Promise<V3PlayerRecord> => {
  const apiCallsAtStart = apiCallCount;
  const networkCallsAtStart = networkCallCount;

  // ---- 1. 本人のプロフィールと履歴（top 100 + recent 100） ----
  let profile: ApiPlayer;
  let ownAll: ApiScoreEntry[];
  try {
    profile = await fetchJson<ApiPlayer>(playerUrl(target.id));
    const topScores = await fetchJson<Paginated<ApiScoreEntry>>(
      scoresUrl(target.id, "top"),
    );
    const recentScores = await fetchJson<Paginated<ApiScoreEntry>>(
      scoresUrl(target.id, "recent"),
    );
    ownAll = dedupeByMap([...recentScores.data, ...topScores.data]);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    throw new OwnFetchError(target.id, error);
  }

  // ---- 2. 周辺プレイヤー（ランク ±100、ランク昇順 = 本番の取得順） ----
  const rank = profile.stats.rank;
  const firstPage = Math.max(1, Math.ceil(Math.max(1, rank - 100) / 100));
  const lastPage = Math.ceil((rank + 100) / 100);
  const aroundPlayers: ApiPlayer[] = [];
  for (let page = firstPage; page <= lastPage; page += 1) {
    const list = await fetchJson<Paginated<ApiPlayer>>(playersPageUrl(page));
    aroundPlayers.push(...list.data);
  }
  const aroundFiltered = aroundPlayers
    .filter((p) => p.id !== profile.id)
    .filter((p) => p.stats.rank >= rank - 100 && p.stats.rank <= rank + 100)
    .sort((a, b) => a.stats.rank - b.stats.rank);
  const prodNeighbours = aroundFiltered.slice(0, PROD_NEIGHBOUR_LIMIT);
  const v3Neighbours = [...aroundFiltered]
    .sort(
      (a, b) =>
        Math.abs(a.stats.rank - rank) - Math.abs(b.stats.rank - rank),
    )
    .slice(0, V3_NEIGHBOUR_LIMIT);
  // ---- 3. 近傍スコアの取得（top は (i)/(ii) 共用、recent は P3 用） ----
  const fetchTop = async (player: ApiPlayer): Promise<NeighbourFetch> => {
    try {
      const scores = await fetchJson<Paginated<ApiScoreEntry>>(
        scoresUrl(player.id, "top"),
      );
      return { player, rawTop: scores.data, rawRecent: null };
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      return { player, rawTop: [], rawRecent: null };
    }
  };
  const prodFetched = await mapWithConcurrency(prodNeighbours, 4, fetchTop);
  const fetchedById = new Map(prodFetched.map((f) => [f.player.id, f]));
  const v3Fetched = await mapWithConcurrency(v3Neighbours, 4, async (candidate) => {
    const existing = fetchedById.get(candidate.id);
    if (existing) return existing;
    const fetched = await fetchTop(candidate);
    fetchedById.set(candidate.id, fetched);
    return fetched;
  });
  // P3 用: v3 近傍の recent を追加取得する。
  await mapWithConcurrency(v3Fetched, 4, async (fetched) => {
    try {
      const recent = await fetchJson<Paginated<ApiScoreEntry>>(
        scoresUrl(fetched.player.id, "recent"),
      );
      fetched.rawRecent = recent.data;
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      fetched.rawRecent = [];
    }
  });

  // ---- 4. 締切 T と学習/テスト集合（90日 → 駄目なら180日、層化と同一） ----
  const now = Date.now();
  let chosen: {
    cutoffDays: number;
    trainEntries: ApiScoreEntry[];
    testGains: Map<number, number>;
  } | null = null;
  for (const cutoffDays of [90, 180]) {
    const cutoffMs = now - cutoffDays * 86_400_000;
    const trainEntries = ownAll.filter((e) => createdBefore(e, cutoffMs));
    const trainProfilePps = trainEntries
      .map((e) => e.score.pp)
      .filter((pp) => pp > 0);
    const trainByMap = new Map(trainEntries.map((e) => [e.leaderboard.id, e]));
    const testGains = new Map<number, number>();
    for (const entry of ownAll) {
      if (createdBefore(entry, cutoffMs)) continue;
      const replaced = trainByMap.get(entry.leaderboard.id);
      const gain = deltaPpForScore(
        trainProfilePps,
        entry.score.pp,
        replaced?.score.pp,
      );
      if (gain >= 1) testGains.set(entry.leaderboard.id, gain);
    }
    if (testGains.size >= 3) {
      chosen = { cutoffDays, trainEntries, testGains };
      break;
    }
    if (!chosen) chosen = { cutoffDays, trainEntries, testGains };
  }
  const { cutoffDays, trainEntries, testGains } = chosen as NonNullable<
    typeof chosen
  >;
  const cutoffMs = now - cutoffDays * 86_400_000;
  const trainByMap = new Map(trainEntries.map((e) => [e.leaderboard.id, e]));
  const trainProfilePps = trainEntries
    .map((e) => e.score.pp)
    .filter((pp) => pp > 0);
  const halfLifeDays = halfLifeDaysForRank(rank);

  const unplayedTestIds = new Set(
    [...testGains.keys()].filter((id) => !trainByMap.has(id)),
  );
  const improvementTestIds = new Set(
    [...testGains.keys()].filter((id) => trainByMap.has(id)),
  );

  const baseRecord = {
    stratum,
    slotIndex,
    player: {
      id: profile.id,
      name: profile.name,
      rank: profile.stats.rank,
      totalPP: profile.stats.totalPP,
    },
    cutoffUsed: cutoffDays,
    trainSize: trainEntries.length,
    testSize: testGains.size,
    unplayedTestSize: unplayedTestIds.size,
    improvementTestSize: improvementTestIds.size,
    fetchedNeighboursProd: prodFetched.filter((f) => f.rawTop.length > 0)
      .length,
    fetchedNeighboursV3: v3Fetched.filter((f) => f.rawTop.length > 0).length,
    apiCallsForPlayer: apiCallCount - apiCallsAtStart,
    networkCallsForPlayer: networkCallCount - networkCallsAtStart,
  };

  if (testGains.size < 3) {
    return { ...baseRecord, status: "no-test-set", methods: null };
  }

  // ---- 5. 方式ごとの母集団と候補 ----
  const plusOnePP = profile.stats.plusOnePP;

  const splitCandidates = (
    universe: CandidateInfo[],
  ): { unplayed: CandidateInfo[]; improvement: CandidateInfo[] } => {
    const unplayed = universe.filter(
      (c) =>
        !trainByMap.has(c.leaderboardId) &&
        plusOnePP !== null &&
        c.competitorMaxPp >= plusOnePP,
    );
    const improvement = universe.filter((c) => {
      const own = trainByMap.get(c.leaderboardId);
      return (
        own !== undefined &&
        c.competitorMaxModifiedScore > own.score.modifiedScore
      );
    });
    return { unplayed, improvement };
  };

  const evaluate = (
    universe: CandidateInfo[],
    orderedIds: number[],
  ): MethodMetrics => {
    const { unplayed, improvement } = splitCandidates(universe);
    const unplayedIds = new Set(unplayed.map((c) => c.leaderboardId));
    const improvementIds = new Set(improvement.map((c) => c.leaderboardId));
    const allGains = universe.map(
      (c) => testGains.get(c.leaderboardId) ?? 0,
    );
    const testInUniverse = universe.filter((c) =>
      testGains.has(c.leaderboardId),
    ).length;

    const tabMetrics = (
      tabIds: Set<number>,
      tabTestIds: Set<number>,
    ): { ndcg: number; recall: number } => {
      const ordered = orderedIds.filter((id) => tabIds.has(id));
      const gains = ordered.map((id) => testGains.get(id) ?? 0);
      const idealGains = [...tabTestIds]
        .filter((id) => tabIds.has(id))
        .map((id) => testGains.get(id) ?? 0);
      return {
        ndcg: ndcgAtK(gains, idealGains, TOP_K),
        recall: recallAtK(ordered, tabTestIds, TOP_K),
      };
    };
    const unplayedMetrics = tabMetrics(unplayedIds, unplayedTestIds);
    const improvementMetrics = tabMetrics(improvementIds, improvementTestIds);

    return {
      ndcg20: ndcgAtK(
        orderedIds.map((id) => testGains.get(id) ?? 0),
        allGains,
        TOP_K,
      ),
      recall20: recallAtK(orderedIds, new Set(testGains.keys()), TOP_K),
      unplayedNdcg20: unplayedMetrics.ndcg,
      unplayedRecall20: unplayedMetrics.recall,
      improvementNdcg20: improvementMetrics.ndcg,
      improvementRecall20: improvementMetrics.recall,
      candidateCount: unplayed.length + improvement.length,
      poolSize: universe.length,
      testInUniverse,
      coverage: testGains.size > 0 ? testInUniverse / testGains.size : null,
    };
  };

  const byAppearance = (a: CandidateInfo, b: CandidateInfo): number =>
    b.appearanceCount - a.appearanceCount ||
    b.competitorMaxPp - a.competitorMaxPp ||
    a.leaderboardId - b.leaderboardId;
  const byFreshness = (a: CandidateInfo, b: CandidateInfo): number =>
    b.freshness - a.freshness ||
    b.competitorMaxPp - a.competitorMaxPp ||
    a.leaderboardId - b.leaderboardId;

  const orderCandidates = (
    universe: CandidateInfo[],
    comparator: (a: CandidateInfo, b: CandidateInfo) => number,
  ): number[] => {
    const { unplayed, improvement } = splitCandidates(universe);
    return [...unplayed, ...improvement]
      .sort(comparator)
      .map((c) => c.leaderboardId);
  };

  // (i) 本番現行: top50 プール、出現人数順。
  const universeI = buildCandidates(
    prodFetched,
    (n) => dedupeByMap(n.rawTop.slice(0, PROD_TOP_LIMIT)),
    cutoffMs,
    halfLifeDays,
    trainEntries,
  );
  // (ii) v3: top100 プール、鮮度重み順。
  const universeII = buildCandidates(
    v3Fetched,
    (n) => n.rawTop,
    cutoffMs,
    halfLifeDays,
    trainEntries,
  );
  // (ii+P3): top + recent プール、鮮度重み順。
  const universeIIP3 = buildCandidates(
    v3Fetched,
    (n) => [...n.rawTop, ...(n.rawRecent ?? [])],
    cutoffMs,
    halfLifeDays,
    trainEntries,
  );

  // (iii) B2 ブレンド: z(fresh) + 0.5·z(期待ΔPP)。期待ΔPP は表示用と
  // 同じ計算（個人カーブ予測精度 → 自己校正 PP カーブ → 正確 ΔPP）。
  const ownCurve = fitAccuracyCurve(toObservations(trainEntries), {
    averageAccuracy: profile.stats.averageAccuracy,
  });
  const ppCurve = fitPpCurve([
    ...toPpSamples(trainEntries),
    ...v3Fetched.flatMap((f) =>
      toPpSamples(
        dedupeByMap(f.rawTop).filter((e) => createdBefore(e, cutoffMs)),
      ),
    ),
  ]);
  const expectedDelta = (c: CandidateInfo): number =>
    deltaPpForScore(
      trainProfilePps,
      ppCurve.predictPp(
        c.stars,
        ownCurve.predictAccuracy(c.stars, c.characteristic),
      ),
      trainByMap.get(c.leaderboardId)?.score.pp,
    );
  const orderBlended = (universe: CandidateInfo[]): number[] => {
    const { unplayed, improvement } = splitCandidates(universe);
    const candidates = [...unplayed, ...improvement];
    const mean = (values: number[]): number =>
      values.length > 0
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : 0;
    const sd = (values: number[], m: number): number =>
      values.length > 0
        ? Math.sqrt(
            values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length,
          )
        : 0;
    const freshValues = candidates.map((c) => c.freshness);
    const deltaValues = candidates.map((c) => expectedDelta(c));
    const freshMean = mean(freshValues);
    const freshSd = sd(freshValues, freshMean);
    const deltaMean = mean(deltaValues);
    const deltaSd = sd(deltaValues, deltaMean);
    const z = (v: number, m: number, s: number): number =>
      s > 0 ? (v - m) / s : 0;
    return candidates
      .map((c) => ({
        c,
        blend:
          z(c.freshness, freshMean, freshSd) +
          0.5 * z(expectedDelta(c), deltaMean, deltaSd),
      }))
      .sort(
        (a, b) =>
          b.blend - a.blend ||
          b.c.freshness - a.c.freshness ||
          b.c.competitorMaxPp - a.c.competitorMaxPp ||
          a.c.leaderboardId - b.c.leaderboardId,
      )
      .map((s) => s.c.leaderboardId);
  };

  const methods: Record<string, MethodMetrics> = {
    [METHOD_I]: evaluate(universeI, orderCandidates(universeI, byAppearance)),
    [METHOD_II]: evaluate(universeII, orderCandidates(universeII, byFreshness)),
    [METHOD_III]: evaluate(universeII, orderBlended(universeII)),
    [METHOD_II_P3]: evaluate(
      universeIIP3,
      orderCandidates(universeIIP3, byFreshness),
    ),
  };

  return { ...baseRecord, status: "ok", methods };
};

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------

interface MethodAggregate {
  name: string;
  overall: {
    ndcg20: number | null;
    recall20: number | null;
    unplayedNdcg20: number | null;
    improvementNdcg20: number | null;
    coverage: number | null;
    playerCount: number;
  };
  perStratum: Record<
    string,
    { ndcg20: number | null; recall20: number | null; playerCount: number }
  >;
}

const meanOrNull = (values: number[]): number | null =>
  values.length > 0
    ? values.reduce((sum, v) => sum + v, 0) / values.length
    : null;

const aggregateMethod = (
  name: string,
  okRecords: V3PlayerRecord[],
): MethodAggregate => {
  const pick = (records: V3PlayerRecord[]) => {
    const found = records
      .map((r) => r.methods?.[name])
      .filter((m): m is MethodMetrics => Boolean(m));
    return {
      ndcg20: meanOrNull(found.map((m) => m.ndcg20)),
      recall20: meanOrNull(found.map((m) => m.recall20)),
      unplayedNdcg20: meanOrNull(found.map((m) => m.unplayedNdcg20)),
      improvementNdcg20: meanOrNull(found.map((m) => m.improvementNdcg20)),
      coverage: meanOrNull(
        found
          .map((m) => m.coverage)
          .filter((v): v is number => v !== null),
      ),
      playerCount: found.length,
    };
  };
  const perStratum: MethodAggregate["perStratum"] = {};
  for (const label of STRATA) {
    const subset = okRecords.filter((r) => r.stratum === label);
    const picked = pick(subset);
    perStratum[label] = {
      ndcg20: picked.ndcg20,
      recall20: picked.recall20,
      playerCount: picked.playerCount,
    };
  }
  return { name, overall: pick(okRecords), perStratum };
};

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

const runBacktest = async (): Promise<void> => {
  const startedAt = Date.now();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    strata: Array<{
      stratum: string;
      slots: Array<{
        slotIndex: number;
        selected: { id: string; name: string; rank: number } | null;
      }>;
    }>;
  };

  const records = loadProgress();
  const doneKeys = new Set(
    records.map((r) => `${r.stratum}:${r.slotIndex}`),
  );
  let stoppedDueToRateLimit = false;
  let stoppedDueToError: string | undefined;

  try {
    for (const stratumEntry of manifest.strata) {
      const label = stratumEntry.stratum as StratumLabel;
      for (const slot of stratumEntry.slots) {
        if (!slot.selected) continue;
        const key = `${label}:${slot.slotIndex}`;
        if (doneKeys.has(key)) continue;
        try {
          const record = await evaluatePlayer(slot.selected, label, slot.slotIndex);
          records.push(record);
          doneKeys.add(key);
          writeProgress(records);
        } catch (error) {
          if (error instanceof RateLimitError) throw error;
          if (error instanceof OwnFetchError) {
            // 本人取得失敗は記録して次へ（層化では差し替え対象だったが、
            // 本実行では同一プレイヤー再評価が目的のため差し替えない）。
            records.push({
              stratum: label,
              slotIndex: slot.slotIndex,
              player: {
                id: slot.selected.id,
                name: slot.selected.name,
                rank: slot.selected.rank,
                totalPP: 0,
              },
              status: "no-test-set",
              cutoffUsed: 90,
              trainSize: 0,
              testSize: 0,
              unplayedTestSize: 0,
              improvementTestSize: 0,
              fetchedNeighboursProd: 0,
              fetchedNeighboursV3: 0,
              apiCallsForPlayer: 0,
              networkCallsForPlayer: 0,
              methods: null,
            });
            doneKeys.add(key);
            writeProgress(records);
            continue;
          }
          throw error;
        }
      }
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      stoppedDueToRateLimit = true;
    } else {
      stoppedDueToError =
        error instanceof Error ? error.message : String(error);
    }
  }

  const okRecords = records.filter((r) => r.status === "ok");
  const results = {
    generatedAt: new Date().toISOString(),
    stoppedDueToRateLimit,
    ...(stoppedDueToError ? { stoppedDueToError } : {}),
    counts: {
      evaluatedOk: okRecords.length,
      noTestSet: records.filter((r) => r.status === "no-test-set").length,
      completed: records.length,
    },
    methods: METHOD_NAMES.map((name) => aggregateMethod(name, okRecords)),
    totals: {
      logicalApiCalls: apiCallCount,
      networkCalls: networkCallCount,
      wallClockSeconds: Math.round((Date.now() - startedAt) / 1000),
    },
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  writeProgress(records);
};

const shouldRun = process.env.BACKTEST === "1";

describe.skipIf(!shouldRun)("RecommendMap v3 バックテスト (DESIGN_V3.md §6)", () => {
  it("層化サンプルで (i) 本番現行 / (ii) v3 / (iii) v3+B2 を比較する", async () => {
    await runBacktest();
    expect(existsSync(RESULTS_PATH)).toBe(true);
  });
});
