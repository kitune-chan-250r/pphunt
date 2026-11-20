# `usePlayerScoreRepository.ts` — プレイヤースコア取得

## 役割

プレイヤーごとのスコアを取得する層。今回の処理の中心。200人 × 50件 = 最大10,000件のスコアを、同時数を抑えながら取得する。

## インターフェース

```ts
export type ScoreSort = "top" | "recent" | "oldest" | "accuracy";

export interface GetPlayerScoresParams {
  page?: number;
  limit?: number;
  sort?: ScoreSort;
  leaderboardId?: number;
  mapId?: number;
  search?: string;
  personalBest?: "all";
  realmId?: number;
}

export interface PlayerScoreRepository {
  getPlayerScores(playerId: string, params?: GetPlayerScoresParams): Promise<PaginatedResponse<PlayerScoreEntry>>;
  getTopScores(playerId: string, limit?: number): Promise<PaginatedResponse<PlayerScoreEntry>>;
  getScoreByHash(playerId: string, hash: string, gameMode: string, difficulty: number): Promise<Score | null>;
}

export const usePlayerScoreRepository = (client?: ScoreSaberClient): PlayerScoreRepository;
```

## 解説

### `getPlayerScores` / `getTopScores`

`GET /api/v2/players/{id}/scores`。スキーマ上 `sort` の既定は `top`、`limit` の既定は 8、最大100。`getTopScores` は `sort=top` を明示した補助関数で、既定 limit 50。

レスポンスの item は `{ score, leaderboard }` の2段構造。Leaderboard ID は `item.leaderboard.id` にある。

```ts
interface PlayerScoreEntry {
  score: Score; // modifiedScore, pp, accuracy, rank ...
  leaderboard: Leaderboard; // id, map, difficulty, realm ...
}
```

`limit` は100が上限なので、50件を超えて100件以上欲しい場合は `page` を増やす。`metadata.totalPages` を見てループする。

### `getScoreByHash` — 404 を `null` に変換する

`GET /api/v2/players/{id}/scores/hash/{hash}/{mode}/{difficulty}` は、そのプレイヤーの**その譜面におけるスコア1件**を返す。スコアがない場合は 404 を返す。

この 404 は「未プレイ」を意味する有効な回答なので、例外として投げっぱなしにせず `null` に変換している。

```ts
try {
  return await client.get<Score>(path);
} catch (error) {
  if (isNotFound(error)) return null;
  throw error;
}
```

これは設計上の要点：**「トップ50に含まれない」ことと「未プレイ」は違う**。トップ50の集合だけでは未プレイと断定できないため、このエンドポイントで実際のスコアを確認する必要がある。

```ts
// 例：自分のトップ50にない譜面について、実際にプレイ済みか確認する
const myScore = await scores.getScoreByHash(
  playerId,
  leaderboard.map.hash,
  leaderboard.difficulty.gameMode,
  leaderboard.difficulty.difficulty,
);

if (myScore === null) {
  // 未プレイ
} else {
  // プレイ済み・トップ50外
}
```

`hash`、`gameMode`、`difficulty` は `PlayerScoreEntry.leaderboard` から取れる。`difficulty` は数値（`LeaderboardDifficulty.difficulty`）で、`rawDifficulty`（文字列）ではない。

## 使用例

### 200人のトップ50を集約する

```ts
import { createScoreSaberClient } from "./scoreSaberClient";
import { usePlayerScoreRepository } from "./usePlayerScoreRepository";
import type { PlayerScoreEntry, RankedPlayer } from "../types/ScoreSaber";

const client = createScoreSaberClient({ concurrency: 6 });
const scores = usePlayerScoreRepository(client);

interface CompetitorScore {
  playerId: string;
  playerName: string;
  globalRank: number;
  leaderboardId: number;
  score: number;
}

const competitorScores = new Map<number, CompetitorScore[]>();

for (const player of nearbyPlayers) {
  const response = await scores.getTopScores(player.id, 50);

  for (const item of response.data) {
    const leaderboardId = item.leaderboard.id;
    const bucket = competitorScores.get(leaderboardId) ?? [];

    bucket.push({
      playerId: player.id,
      playerName: player.name,
      globalRank: player.stats.rank,
      leaderboardId,
      score: item.score.modifiedScore,
    });

    competitorScores.set(leaderboardId, bucket);
  }
}
```

共有クライアントのリミッターが通信開始間隔（既定300ms）と同時実行数（既定4）を管理するため、`Promise.all(nearbyPlayers.map(...))` でも200件が一度にScoreSaberへ送信されることはない。大量処理で進捗を細かく反映したい場合は、アプリの分析フックのようにワーカー数も制限する。

### 自分のトップ50を Map で管理する

```ts
const myTop = await scores.getTopScores(playerId, 50);

const myScores = new Map<number, number>();
for (const item of myTop.data) {
  myScores.set(item.leaderboard.id, item.score.modifiedScore);
}
```

### 分類（未プレイ / トップ50外 / 更新候補）

```ts
type Classification = "UNPLAYED" | "OUTSIDE_TOP50" | "IMPROVEMENT_CANDIDATE";

const classify = async (
  playerId: string,
  myScores: Map<number, number>,
  competitorScores: Map<number, CompetitorScore[]>,
  leaderboards: LeaderboardRepository,
  scores: PlayerScoreRepository,
) => {
  const result = new Map<number, Classification>();

  for (const [leaderboardId, others] of competitorScores) {
    const mine = myScores.get(leaderboardId);

    if (mine !== undefined) {
      if (others.some((item) => item.score > mine)) {
        result.set(leaderboardId, "IMPROVEMENT_CANDIDATE");
      }
      continue;
    }

    // 自分のトップ50にない譜面：実際にプレイ済みかは個別確認が必要
    const leaderboard = await leaderboards.getLeaderboard(leaderboardId);
    const actual = await scores.getScoreByHash(
      playerId,
      leaderboard.map.hash,
      leaderboard.difficulty.gameMode,
      leaderboard.difficulty.difficulty,
    );

    result.set(leaderboardId, actual === null ? "UNPLAYED" : "OUTSIDE_TOP50");
  }

  return result;
};
```

### 100件を超えるトップスコアを取得する

```ts
const all: PlayerScoreEntry[] = [];
let page = 1;

while (true) {
  const response = await scores.getPlayerScores(playerId, {
    sort: "top",
    limit: 100,
    page,
  });
  all.push(...response.data);
  if (page >= response.metadata.totalPages) break;
  page += 1;
}
```

## 注意点

- `sort=top` と `limit=50` の組み合わせは OpenAPI スキーマで確認済み（`sort` の enum に `top`、既定 `top`、`limit` 最大100）。実レスポンスの item が `{ score, leaderboard }` であることも確認済み。
- `personalBest` はスキーマ上 `anyOf[string, enum["all"]]`。この層では `"all"` だけ通している。
- 404 はリトライしない（`scoreSaberClient` の `isRetryable` で除外）。未プレイ譜面の確認で100件の404が返ることは正常な動作。
- `getScoreByHash` はキャッシュされる。同じ譜面の再確認はリクエストを増やさない。

## 検証済み事実

- `GET /api/v2/players/{id}/scores` の item は `{ score, leaderboard }`。
- `GET /api/v2/players/{id}/scores/hash/{hash}/{mode}/{difficulty}` はフラットな `Score` を返し、未プレイなら 404（`isNotFound` → true）。
- 実レスポンスに `hasHistory` が含まれる（スキーマには記載がないが型には含めている）。
