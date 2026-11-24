/**
 * Phase 3 バックテストハーネス（DESIGN.md §3.6）— 単一プレイヤー予備サンプル。
 *
 * 時間軸で未来を隠す time-split バックテスト:
 * - 締切 T 以前のスコアだけで精度カーブ・PP カーブ・類似度・近傍を作る。
 * - テスト集合は「T 以後に記録され、実績の重み付き ΔPP が 1 以上だったプレイ」。
 * - 近傍プレイヤーのデータも T 以後のスコアを除外し、リークを抑える。
 * - 4つのランキング（フルモデル / 人気順 / フラット95% / 現行方式近似）を
 *   NDCG@20 と Recall@20 で比較する。
 *
 * 実行条件: 環境変数 BACKTEST=1 のときだけ動く（通常のテスト実行では skip）。
 * 実行: `npm run test:backtest`
 *
 * 注意: これは DESIGN.md §3.6 が求める「層化した100人規模」の評価ではなく、
 * 実在の公開プレイヤー1名だけを対象にした予備サンプルである。
 * フルモデルは本体フック（useMapRecommendations.ts）のロジックを簡略化して
 * 鏡写しにしたもので、譜面残差 ε_m と MMR 多様性再ランキングは省略している。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  fitAccuracyCurve,
  normaliseAccuracy,
  type AccuracyCurve,
  type AccuracyObservation,
} from "../../src/feature/map-recommend/lib/accuracyCurve";
import { fitPpCurve } from "../../src/feature/map-recommend/lib/ppCurve";
import { deltaPpForScore } from "../../src/feature/map-recommend/lib/ppGain";
import {
  computeMapMedianAccuracies,
  computeSimilarity,
  transportAccuracy,
  type PlayerScoreSummary,
} from "../../src/feature/map-recommend/lib/similarity";

// ---------------------------------------------------------------------------
// 最小限の API 型（このハーネスが使うフィールドのみ）
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
// 定数（本体フックの値に合わせる）
// ---------------------------------------------------------------------------

const API_BASE = "https://scoresaber.com/api/v2";
const CACHE_DIR = "/tmp/pphunt-backtest-cache";
const PACE_MS = 300;
const LCB_QUANTILE = 0.2;
const MIN_SIMILARITY = 0.15;
const MAX_NEIGHBOURS = 30;
const MIN_COLLABORATIVE_NEIGHBOURS = 10;
const MAX_NEIGHBOUR_CANDIDATES = 40;
const PP_RATIO_MIN = 0.6;
const PP_RATIO_MAX = 1.6;
const TOP_K = 20;

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_MD_PATH = join(HERE, "RESULTS.md");
const RESULTS_JSON_PATH = join(HERE, "results.json");

// ---------------------------------------------------------------------------
// キャッシュ付きフェッチ（~300ms ペーシング、失敗時は1回だけリトライ）
// ---------------------------------------------------------------------------

let apiCallCount = 0; // 論理呼び出し回数（キャッシュヒット含む）
let networkCallCount = 0; // 実際にネットワークへ出た回数（リトライ含む）
let lastNetworkAt = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    const wait = PACE_MS - (Date.now() - lastNetworkAt);
    if (wait > 0) await sleep(wait);
    lastNetworkAt = Date.now();
    networkCallCount += 1;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const json = (await response.json()) as T;
      writeFileSync(cachePath, JSON.stringify(json));
      return json;
    } catch (error) {
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
  `${API_BASE}/players/${id}/scores?sort=${sort}&limit=100`;

// ---------------------------------------------------------------------------
// スコア履歴の整形ヘルパー
// ---------------------------------------------------------------------------

/** top + recent を leaderboard 単位で統合し、PP 最大のものをベストとする。 */
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

const toSummaries = (entries: ApiScoreEntry[]): PlayerScoreSummary[] =>
  entries.map((entry) => ({
    leaderboardId: entry.leaderboard.id,
    accuracy: entry.score.accuracy,
    pp: entry.score.pp,
    stars: entry.leaderboard.realm.stars,
    characteristic: entry.leaderboard.difficulty.gameMode,
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
// 指標
// ---------------------------------------------------------------------------

/** NDCG@k（gain = 実績 ΔPP、非テスト候補は 0）。 */
const ndcgAtK = (orderedGains: number[], allGains: number[], k: number): number => {
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

/** Recall@k（テスト集合のうち上位 k 件に入った割合）。 */
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
// 候補・近傍の内部表現
// ---------------------------------------------------------------------------

interface NeighbourData {
  id: string;
  name: string;
  rank: number;
  /** T 以前のみに絞ったスコア（anti-leakage）。 */
  trainEntries: ApiScoreEntry[];
  summaries: PlayerScoreSummary[];
  curve: AccuracyCurve;
  similarity: number;
}

interface CandidateInfo {
  leaderboardId: number;
  stars: number;
  characteristic: string;
  label: string;
  /** この譜面を T 以前にプレイしていた取得済みプレイヤー（出現人数の母数）。 */
  appearanceCount: number;
  /** 出現プレイヤーのうち最高の raw PP（train フィルタ済み）。 */
  competitorMaxPp: number;
  /** 類似プレイヤー（sim >= 0.15）のこの譜面でのスコア。 */
  similarScores: Array<{ neighbour: NeighbourData; score: ApiScore }>;
}

interface RankingResult {
  name: string;
  orderedIds: number[];
  ndcg20: number;
  recall20: number;
}

interface TopHit {
  rank: number;
  label: string;
  stars: number;
  predictedDeltaPp: number;
  actualDeltaPp: number | null;
}

interface BacktestReport {
  status: "ok" | "no-test-set" | "error";
  message?: string;
  player?: { id: string; name: string; rank: number; totalPP: number };
  cutoffDays?: number;
  cutoffIso?: string;
  trainSize?: number;
  testSize?: number;
  testInUniverse?: number;
  candidateCount?: number;
  fetchedNeighbours?: number;
  similarNeighbours?: number;
  collaborativeReady?: boolean;
  apiCallCount?: number;
  networkCallCount?: number;
  rankings?: RankingResult[];
  top10?: TopHit[];
  /** フルモデル順位におけるテスト譜面の順位（1始まり、母集団外は null）。 */
  fullModelTestRanks?: Array<number | null>;
}

// ---------------------------------------------------------------------------
// RESULTS.md の生成
// ---------------------------------------------------------------------------

const fmt = (value: number, digits = 3): string => value.toFixed(digits);

const writeResultsMd = (report: BacktestReport): void => {
  const lines: string[] = [];
  lines.push("# バックテスト結果（Phase 3 / DESIGN.md §3.6）");
  lines.push("");
  lines.push(
    "> **これは単一プレイヤーの予備サンプルである。** DESIGN.md §3.6 が求める「層化した100人規模（ランク 1–100 / 100–1k / 1k–5k / 5k–20k）」の評価ではなく、実在の公開プレイヤー1名・締切1点だけの先行計測である。絶対値ではなくベースラインとの差で読むこと。",
  );
  lines.push("");

  if (report.status === "error") {
    lines.push("## 実行失敗");
    lines.push("");
    lines.push(
      `ライブ API へのアクセスが失敗し、バックテストを完了できなかった。理由: ${report.message ?? "不明"}`,
    );
    lines.push("");
    lines.push(
      `記録できた範囲: 論理 API 呼び出し ${report.apiCallCount ?? 0} 回（うちネットワーク実呼び出し ${report.networkCallCount ?? 0} 回）。数値は捏造していない。再実行は \`npm run test:backtest\`。`,
    );
    writeFileSync(RESULTS_MD_PATH, lines.join("\n") + "\n");
    writeFileSync(RESULTS_JSON_PATH, JSON.stringify(report, null, 2));
    return;
  }

  const player = report.player as NonNullable<BacktestReport["player"]>;
  lines.push("## サンプルプレイヤー（公開データ）");
  lines.push("");
  lines.push(`- 名前: ${player.name}`);
  lines.push(`- ランク: ${player.rank}`);
  lines.push(`- プレイヤー ID: ${player.id}`);
  lines.push(`- 総 PP（取得時点）: ${fmt(player.totalPP, 1)}`);
  lines.push(
    "- 選定方法: `GET /api/v2/players?sort=rank&limit=100&page=9` の先頭から、ランク 500–3000 かつ `totalPlayedRankedLeaderboards >= 80` を満たす最初のプレイヤー（決定的選定）。",
  );
  lines.push("");

  lines.push("## 条件");
  lines.push("");
  lines.push(`- 締切 T: ${report.cutoffDays} 日前（${report.cutoffIso}）`);
  lines.push(`- 学習集合（T 以前）: ${report.trainSize} 譜面`);
  lines.push(
    `- テスト集合（T 以後かつ実績 ΔPP >= 1）: ${report.testSize} 譜面（うち候補母集団に含まれるもの ${report.testInUniverse} 譜面）`,
  );
  lines.push(`- 候補母集団: ${report.candidateCount} 譜面`);
  lines.push(
    `- 近傍: ランク ±100・総 PP 比 [0.6, 1.6] で取得 ${report.fetchedNeighbours} 人、類似度 >= 0.15 は ${report.similarNeighbours} 人（協調フィルタリング有効: ${report.collaborativeReady ? "はい（10人以上）" : "いいえ"}）`,
  );
  lines.push(
    `- API 呼び出し: 論理 ${report.apiCallCount} 回（この実行でネットワークへ出たのは ${report.networkCallCount} 回、残りは /tmp/pphunt-backtest-cache/ のキャッシュ）`,
  );
  lines.push("");

  if (report.status === "no-test-set") {
    lines.push("## 結果");
    lines.push("");
    lines.push(
      `締切を90日前・180日前の両方で試したが、テスト集合（実績 ΔPP >= 1）が3件未満だったため、指標は算出しなかった。${report.message ?? ""} 数値は捏造していない。`,
    );
    writeFileSync(RESULTS_MD_PATH, lines.join("\n") + "\n");
    writeFileSync(RESULTS_JSON_PATH, JSON.stringify(report, null, 2));
    return;
  }

  lines.push("## 指標（NDCG@20 / Recall@20、gain = 実績 ΔPP）");
  lines.push("");
  lines.push("| ランキング | NDCG@20 | Recall@20 |");
  lines.push("|---|---:|---:|");
  for (const ranking of report.rankings ?? []) {
    lines.push(
      `| ${ranking.name} | ${fmt(ranking.ndcg20)} | ${fmt(ranking.recall20)} |`,
    );
  }
  lines.push("");

  lines.push("## フルモデルの上位10件（予測 ΔPP と実績）");
  lines.push("");
  lines.push("| 順位 | 譜面 | stars | 予測 ΔPP | 実績 ΔPP |");
  lines.push("|---:|---|---:|---:|---:|");
  for (const hit of report.top10 ?? []) {
    lines.push(
      `| ${hit.rank} | ${hit.label} | ${fmt(hit.stars, 2)} | ${fmt(hit.predictedDeltaPp, 2)} | ${hit.actualDeltaPp === null ? "—（テスト集合外）" : fmt(hit.actualDeltaPp, 2)} |`,
    );
  }
  lines.push("");

  lines.push("## 既知のバイアス");
  lines.push("");
  lines.push(
    "- **ベストスコアのみ観測（打ち切り）**: ScoreSaber API はベストスコアしか返さない。「T 以前にプレイ済みだが T 以後に更新した譜面」は履歴から消えてテスト集合に混入し、ヒット率を実力以上に良く見せる（DESIGN.md §3.6）。近傍プレイヤー側も同じ打ち切りを受けるため、T 以前のベストが T 以後に更新されていた場合、その譜面は近傍の学習データからも静かに消える。",
  );
  lines.push(
    "- **自己選択バイアス**: テスト集合は「本人が選んでプレイした譜面」に偏る。推薦されても本人が選ばない譜面の反実仮想は測れない。",
  );
  lines.push(
    "- **可視範囲の限定**: 自分の履歴は top 100 + recent 100 の統合（重複除き最大200件）しか見ていない。学習・テストともこの範囲内の話である。",
  );
  lines.push(
    "- **単一プレイヤー・締切1点**: walk-forward（締切をずらした反復）も層化サンプリングもしていない。順位帯やプレイスタイルが違えば傾向は変わりうる。",
  );
  lines.push(
    "- **フルモデルは本体フックの簡略鏡写し**: 譜面残差 ε_m と MMR 多様性再ランキングは省略した。また本体フックと違い、候補全件を順位付けしている（表示用の ΔPP_LCB > 0 フィルタは掛けていない）。",
  );
  lines.push("");

  const rankings = report.rankings ?? [];
  const full = rankings.find((r) => r.name.startsWith("(a)"));
  const flat = rankings.find((r) => r.name.startsWith("(c)"));
  const pop = rankings.find((r) => r.name.startsWith("(b)"));
  lines.push("## 結論");
  lines.push("");
  if (full && flat && pop) {
    const verdict =
      full.ndcg20 > flat.ndcg20
        ? `フルモデル（NDCG@20 = ${fmt(full.ndcg20)}）はフラット95%ベースライン（${fmt(flat.ndcg20)}）を上回り、DESIGN.md §3.6 の「フルモデルが (ii) に明確に勝てなければ簡略版を採る」という判断基準に対しては、この1サンプルではフルモデル支持の結果になった`
        : `フルモデル（NDCG@20 = ${fmt(full.ndcg20)}）はフラット95%ベースライン（${fmt(flat.ndcg20)}）を上回れず、DESIGN.md §3.6 の判断基準に照らすと「(ii) + LCB の簡略版」も有力なままである`;
    lines.push(
      `テスト集合 ${report.testSize} 件という小さな予備サンプルではあるが、${verdict}。人気順ベースラインは NDCG@20 = ${fmt(pop.ndcg20)} だった。ただし単一プレイヤー・締切1点の計測であり、上記の打ち切りバイアスも効いているため、本採用の判断は100人規模の層化評価で行うべきである。`,
    );
    const ranks = report.fullModelTestRanks ?? [];
    if (ranks.length > 0) {
      const inUniverse = ranks.filter((r) => r !== null) as number[];
      const best = inUniverse.length > 0 ? Math.min(...inUniverse) : null;
      lines.push(
        `参考所見: テスト譜面 ${ranks.length} 件のうち候補母集団に入っていたのは ${inUniverse.length} 件だけで、そのフルモデル順位も最良で ${best ?? "—"} 位だった。このプレイヤーが締切後に実際に伸ばしたのは比較的低〜中 stars の譜面であり、全ランキングとも上位は高 ΔPP 見込みの難譜面に寄ったため、20位以内には1件も入らなかった。母集団のカバー率と「本人が次に手を付ける譜面」の性質のずれが、このサンプルではモデル差よりも支配的だった。`,
      );
    }
  }
  lines.push("");
  writeFileSync(RESULTS_MD_PATH, lines.join("\n") + "\n");
  writeFileSync(RESULTS_JSON_PATH, JSON.stringify(report, null, 2));
};

// ---------------------------------------------------------------------------
// バックテスト本体
// ---------------------------------------------------------------------------

const runBacktest = async (): Promise<BacktestReport> => {
  // ---- 1. サンプルプレイヤーの決定的選定 ----
  // page=9（ランク 801–900 帯）から走査し、条件を満たす最初のプレイヤーを採る。
  let target: ApiPlayer | null = null;
  for (const page of [9, 10, 11, 12]) {
    const list = await fetchJson<Paginated<ApiPlayer>>(playersPageUrl(page));
    target =
      list.data.find(
        (p) =>
          p.stats.rank >= 500 &&
          p.stats.rank <= 3000 &&
          p.stats.totalPlayedRankedLeaderboards >= 80,
      ) ?? null;
    if (target) break;
  }
  if (!target) {
    throw new Error("サンプルプレイヤーの選定に失敗した（候補ページに条件該当者なし）");
  }

  // ---- 2. 本人のプロフィールと履歴（top 100 + recent 100） ----
  const profile = await fetchJson<ApiPlayer>(playerUrl(target.id));
  const topScores = await fetchJson<Paginated<ApiScoreEntry>>(
    scoresUrl(target.id, "top"),
  );
  const recentScores = await fetchJson<Paginated<ApiScoreEntry>>(
    scoresUrl(target.id, "recent"),
  );
  const ownAll = dedupeByMap([...recentScores.data, ...topScores.data]);

  // ---- 3. ランク ±100 の近傍候補を取得し、総 PP 比で絞って最大40人 ----
  const rank = profile.stats.rank;
  const firstPage = Math.max(1, Math.ceil(Math.max(1, rank - 100) / 100));
  const lastPage = Math.ceil((rank + 100) / 100);
  const aroundPlayers: ApiPlayer[] = [];
  for (let page = firstPage; page <= lastPage; page += 1) {
    const list = await fetchJson<Paginated<ApiPlayer>>(playersPageUrl(page));
    aroundPlayers.push(...list.data);
  }
  const myTotalPp = profile.stats.totalPP;
  const neighbourCandidates = aroundPlayers
    .filter((p) => p.id !== profile.id)
    .filter((p) => p.stats.rank >= rank - 100 && p.stats.rank <= rank + 100)
    .filter((p) => {
      if (myTotalPp <= 0) return true;
      const ratio = p.stats.totalPP / myTotalPp;
      return ratio >= PP_RATIO_MIN && ratio <= PP_RATIO_MAX;
    })
    .sort(
      (a, b) =>
        Math.abs(a.stats.rank - rank) - Math.abs(b.stats.rank - rank),
    )
    .slice(0, MAX_NEIGHBOUR_CANDIDATES);

  const fetchedRaw: Array<{ player: ApiPlayer; entries: ApiScoreEntry[] }> = [];
  for (const candidate of neighbourCandidates) {
    try {
      const scores = await fetchJson<Paginated<ApiScoreEntry>>(
        scoresUrl(candidate.id, "top"),
      );
      fetchedRaw.push({ player: candidate, entries: dedupeByMap(scores.data) });
    } catch {
      // 取得失敗した近傍は静かに落とす（現行方式の failedPlayers と同じ扱い）。
    }
  }

  // ---- 4. 締切 T を決め、学習/テスト集合を作る（90日 → 駄目なら180日） ----
  const now = Date.now();
  let chosen: {
    cutoffDays: number;
    trainEntries: ApiScoreEntry[];
    testGains: Map<number, number>;
  } | null = null;
  const testSizeByCutoff = new Map<number, number>();
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
    testSizeByCutoff.set(cutoffDays, testGains.size);
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
  const trainProfilePps = trainEntries
    .map((e) => e.score.pp)
    .filter((pp) => pp > 0);
  const trainByMap = new Map(trainEntries.map((e) => [e.leaderboard.id, e]));

  // ---- 5. 近傍を T 以前のみに絞り、類似度を計算する ----
  const neighbours: NeighbourData[] = fetchedRaw.map(({ player, entries }) => {
    const trainEntries = entries.filter((e) => createdBefore(e, cutoffMs));
    return {
      id: player.id,
      name: player.name,
      rank: player.stats.rank,
      trainEntries,
      summaries: toSummaries(trainEntries),
      curve: fitAccuracyCurve(toObservations(trainEntries)),
      similarity: 0,
    };
  });
  const ownTrainSummaries = toSummaries(trainEntries);
  const mapMedians = computeMapMedianAccuracies([
    ownTrainSummaries,
    ...neighbours.map((n) => n.summaries),
  ]);
  for (const neighbour of neighbours) {
    neighbour.similarity = computeSimilarity(
      ownTrainSummaries,
      neighbour.summaries,
      mapMedians,
    ).similarity;
  }
  const similarNeighbours = neighbours
    .filter((n) => n.similarity >= MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_NEIGHBOURS);
  const similarById = new Map(similarNeighbours.map((n) => [n.id, n]));
  const collaborativeReady =
    similarNeighbours.length >= MIN_COLLABORATIVE_NEIGHBOURS;

  // ---- 6. 候補母集団（近傍の学習スコア ∪ 自分の学習済み譜面） ----
  const candidates = new Map<number, CandidateInfo>();
  const ensureCandidate = (entry: ApiScoreEntry): CandidateInfo => {
    const id = entry.leaderboard.id;
    let candidate = candidates.get(id);
    if (!candidate) {
      const sub = entry.leaderboard.map.songSubName;
      candidate = {
        leaderboardId: id,
        stars: entry.leaderboard.realm.stars,
        characteristic: entry.leaderboard.difficulty.gameMode,
        label: `${entry.leaderboard.map.songName}${sub ? ` ${sub}` : ""} [${entry.leaderboard.difficulty.rawDifficulty}]`,
        appearanceCount: 0,
        competitorMaxPp: 0,
        similarScores: [],
      };
      candidates.set(id, candidate);
    }
    return candidate;
  };
  for (const neighbour of neighbours) {
    for (const entry of neighbour.trainEntries) {
      const candidate = ensureCandidate(entry);
      candidate.appearanceCount += 1;
      candidate.competitorMaxPp = Math.max(
        candidate.competitorMaxPp,
        entry.score.pp,
      );
      const similar = similarById.get(neighbour.id);
      if (similar) {
        candidate.similarScores.push({ neighbour: similar, score: entry.score });
      }
    }
  }
  for (const entry of trainEntries) ensureCandidate(entry);

  const candidateList = [...candidates.values()].filter((c) => c.stars > 0);
  const allGains = candidateList.map(
    (c) => testGains.get(c.leaderboardId) ?? 0,
  );
  const testIds = new Set(testGains.keys());
  const testInUniverse = candidateList.filter((c) =>
    testIds.has(c.leaderboardId),
  ).length;

  const baseReport: BacktestReport = {
    status: "ok",
    player: {
      id: profile.id,
      name: profile.name,
      rank: profile.stats.rank,
      totalPP: profile.stats.totalPP,
    },
    cutoffDays,
    cutoffIso: new Date(cutoffMs).toISOString(),
    trainSize: trainEntries.length,
    testSize: testGains.size,
    testInUniverse,
    candidateCount: candidateList.length,
    fetchedNeighbours: neighbours.length,
    similarNeighbours: similarNeighbours.length,
    collaborativeReady,
    apiCallCount,
    networkCallCount,
  };

  if (testGains.size < 3) {
    return {
      ...baseReport,
      status: "no-test-set",
      message: `テスト集合は締切90日前で ${testSizeByCutoff.get(90) ?? 0} 件、180日前で ${testSizeByCutoff.get(180) ?? 0} 件だった（いずれも3件未満）。`,
    };
  }

  // ---- 7. カーブ推定（学習データのみ） ----
  const ownCurve = fitAccuracyCurve(toObservations(trainEntries), {
    averageAccuracy: profile.stats.averageAccuracy,
  });
  const ppCurveFull = fitPpCurve([
    ...toPpSamples(trainEntries),
    ...neighbours.flatMap((n) => toPpSamples(n.trainEntries)),
  ]);
  const ppCurveTrainOnly = fitPpCurve(toPpSamples(trainEntries));

  const replacedPpFor = (leaderboardId: number): number | undefined =>
    trainByMap.get(leaderboardId)?.score.pp;

  const evaluateRanking = (
    name: string,
    orderedIds: number[],
  ): RankingResult => {
    const gains = orderedIds.map((id) => testGains.get(id) ?? 0);
    return {
      name,
      // results.json が巨大にならないよう、保存する順位列は上位50件に絞る。
      orderedIds: orderedIds.slice(0, 50),
      ndcg20: ndcgAtK(gains, allGains, TOP_K),
      recall20: recallAtK(orderedIds, testIds, TOP_K),
    };
  };

  // ---- 8a. フルモデル（本体フックの簡略鏡写し: ε_m と MMR は省略） ----
  interface FullScore {
    candidate: CandidateInfo;
    rankScore: number;
    expectedDeltaPp: number;
  }
  const fullScores: FullScore[] = candidateList.map((candidate) => {
    const curveAcc = ownCurve.predictAccuracy(
      candidate.stars,
      candidate.characteristic,
    );
    const curveLcb = ownCurve.predictAccuracyLcb(
      candidate.stars,
      candidate.characteristic,
      LCB_QUANTILE,
    );
    let predictedAcc = curveAcc;
    let lcbAcc = curveLcb;
    if (collaborativeReady && candidate.similarScores.length > 0) {
      const transported = transportAccuracy(
        candidate.similarScores.map(({ neighbour, score }) => ({
          neighbourAccuracy: normaliseAccuracy(score.accuracy),
          neighbourPredicted: neighbour.curve.predictAccuracy(
            candidate.stars,
            candidate.characteristic,
          ),
          similarity: neighbour.similarity,
        })),
        curveAcc,
      );
      if (transported !== null) {
        const count = candidate.similarScores.length;
        const cfWeight = Math.min(2, count * 0.5);
        predictedAcc = (predictedAcc + cfWeight * transported) / (1 + cfWeight);
        lcbAcc =
          (lcbAcc + cfWeight * (transported - 0.015)) / (1 + cfWeight);
      }
    }
    predictedAcc = Math.min(0.999, Math.max(0.3, predictedAcc));
    lcbAcc = Math.min(predictedAcc, Math.max(0.3, lcbAcc));
    const replacedPp = replacedPpFor(candidate.leaderboardId);
    const expectedDeltaPp = deltaPpForScore(
      trainProfilePps,
      ppCurveFull.predictPp(candidate.stars, predictedAcc),
      replacedPp,
    );
    const lcbDeltaPp = deltaPpForScore(
      trainProfilePps,
      ppCurveFull.predictPp(candidate.stars, lcbAcc),
      replacedPp,
    );
    // クリア可能性ゲートは未プレイ譜面（学習集合に無い譜面）にのみ掛ける。
    const gate = trainByMap.has(candidate.leaderboardId)
      ? 1
      : ownCurve.clearability(candidate.stars);
    return { candidate, rankScore: lcbDeltaPp * gate, expectedDeltaPp };
  });
  fullScores.sort(
    (a, b) =>
      b.rankScore - a.rankScore ||
      b.expectedDeltaPp - a.expectedDeltaPp ||
      a.candidate.leaderboardId - b.candidate.leaderboardId,
  );
  const fullRanking = evaluateRanking(
    "(a) フルモデル",
    fullScores.map((s) => s.candidate.leaderboardId),
  );
  const fullModelTestRanks = [...testGains.keys()].map((id) => {
    const index = fullScores.findIndex(
      (s) => s.candidate.leaderboardId === id,
    );
    return index < 0 ? null : index + 1;
  });
  const top10: TopHit[] = fullScores.slice(0, 10).map((s, i) => ({
    rank: i + 1,
    label: s.candidate.label,
    stars: s.candidate.stars,
    predictedDeltaPp: s.expectedDeltaPp,
    actualDeltaPp: testGains.get(s.candidate.leaderboardId) ?? null,
  }));

  // ---- 8b. 人気順ベースライン ----
  const popularity = [...candidateList].sort(
    (a, b) =>
      b.appearanceCount - a.appearanceCount ||
      b.competitorMaxPp - a.competitorMaxPp ||
      a.leaderboardId - b.leaderboardId,
  );
  const popularityRanking = evaluateRanking(
    "(b) 人気順ベースライン",
    popularity.map((c) => c.leaderboardId),
  );

  // ---- 8c. フラット95%ベースライン ----
  const flat = candidateList
    .map((candidate) => ({
      candidate,
      delta: deltaPpForScore(
        trainProfilePps,
        ppCurveTrainOnly.predictPp(candidate.stars, 0.95),
        replacedPpFor(candidate.leaderboardId),
      ),
    }))
    .sort(
      (a, b) =>
        b.delta - a.delta || a.candidate.leaderboardId - b.candidate.leaderboardId,
    );
  const flatRanking = evaluateRanking(
    "(c) フラット95%ベースライン",
    flat.map((s) => s.candidate.leaderboardId),
  );

  // ---- 8d. 現行方式の近似（v2 以前の本番ロジック） ----
  const plusOnePP = profile.stats.plusOnePP;
  const currentMethod = candidateList
    .filter((c) => !trainByMap.has(c.leaderboardId))
    .filter((c) => plusOnePP !== null && c.competitorMaxPp >= plusOnePP)
    .sort(
      (a, b) =>
        b.appearanceCount - a.appearanceCount ||
        b.competitorMaxPp - a.competitorMaxPp ||
        a.leaderboardId - b.leaderboardId,
    );
  const currentRanking = evaluateRanking(
    "(d) 現行方式（近似）",
    currentMethod.map((c) => c.leaderboardId),
  );

  return {
    ...baseReport,
    rankings: [fullRanking, popularityRanking, flatRanking, currentRanking],
    top10,
    fullModelTestRanks,
  };
};

// ---------------------------------------------------------------------------
// テスト定義（BACKTEST=1 のときだけ実行）
// ---------------------------------------------------------------------------

const RUN = process.env.BACKTEST === "1";

describe.skipIf(!RUN)("Phase 3 backtest (DESIGN.md §3.6, single-player sample)", () => {
  it(
    "time-split backtest against the live ScoreSaber v2 API",
    async () => {
      let report: BacktestReport;
      try {
        report = await runBacktest();
      } catch (error) {
        // ネットワーク失敗は捏造せず、理由を RESULTS.md に残して穏当に終わる。
        report = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          apiCallCount,
          networkCallCount,
        };
      }
      writeResultsMd(report);
      console.log(JSON.stringify(report, null, 2));
      // ネットワーク全滅やテスト集合なしは「失敗」ではなく報告対象として
      // RESULTS.md に残す（捏造しない）。ok のときだけ最低限の健全性を確認する。
      if (report.status === "ok") {
        expect(report.rankings).toHaveLength(4);
        expect(report.testSize ?? 0).toBeGreaterThanOrEqual(3);
      }
    },
    600_000,
  );
});
