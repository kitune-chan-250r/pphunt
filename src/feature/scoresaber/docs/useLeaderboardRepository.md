# `useLeaderboardRepository.ts` — 譜面（Leaderboard）取得

## 役割

Leaderboard ID をキーに「譜面情報」と「譜面別ランキング」を取得する層。比較ロジックで `competitorScores` に集約した Leaderboard ID に対して、自分の実際のスコアを確認する・譜面の表示情報を揃える担当。

## インターフェース

```ts
export interface LeaderboardScoresParams {
  page?: number;
  limit?: number;
  sort?: "score" | "timeSet";
  sortDirection?: "asc" | "desc";
  hideNA?: boolean;
  search?: string;
  realmId?: number;
}

export interface LeaderboardRepository {
  getLeaderboard(leaderboardId: number): Promise<Leaderboard>;
  getLeaderboardByHash(hash: string, gameMode: string, difficulty: number): Promise<Leaderboard>;
  getLeaderboardScores(leaderboardId: number, params?: LeaderboardScoresParams): Promise<PaginatedResponse<LeaderboardScoreEntry>>;
}

export const useLeaderboardRepository = (client?: ScoreSaberClient): LeaderboardRepository;
```

## 解説

### `getLeaderboard(leaderboardId)`

`GET /api/v2/leaderboards/{id}`。**フラットなオブジェクト**を返す（`data` で包まれていない）。これはページネーション付きエンドポイントとの違いで、型定義の `Leaderboard` はフラット形状になっている。

```ts
const leaderboard = await client.get<Leaderboard>(`/api/v2/leaderboards/${id}`);
```

返される `Leaderboard` は比較の単位そのもの：

```ts
interface Leaderboard {
  id: number; // 比較キー
  map: LeaderboardMap; // hash, songName, bpm, coverUrl ...
  difficulty: LeaderboardDifficulty; // difficulty(数値), rawDifficulty, gameMode
  maxScore: number;
  totalScores: number;
  dailyScores: number;
  createdAt: string;
  realm: LeaderboardRealm; // leaderboardStatus, stars ...
  legacyMaxScore?: number; // 実レスポンスには存在するがスキーマにない
}
```

`map.hash`、`difficulty.gameMode`、`difficulty.difficulty` は `getScoreByHash` の引数にそのまま渡せる。この3つが揃って初めて「どの譜面の・どの難易度・どのゲームモードのスコアか」が決まる。

### `getLeaderboardByHash(hash, gameMode, difficulty)`

`GET /api/v2/leaderboards/hash/{hash}/{mode}/{difficulty}`。ハッシュから Leaderboard ID を解決する。スコア payload に Leaderboard が含まれない場合（`LeaderboardScoreEntry`）に、ハッシュから ID を復元するために使う。

```ts
const leaderboard = await leaderboards.getLeaderboardByHash(
  "3F0D9251DB8D9B38114A161D7B4015EB7BDE633C",
  "SoloStandard",
  9,
);
console.log(leaderboard.id); // 2244472
```

`gameMode` はスキーマ上 plain string（`SoloStandard`、`PlusStandard`、`SoloPlusStandard` 等）。列挙値ではないので未知の値が来る可能性がある。

### `getLeaderboardScores(leaderboardId, params)`

`GET /api/v2/leaderboards/{id}/scores`。item が **フラットな `Score`** で、`leaderboard` のラッパーがない。`score.player` にプレイヤー参照が入っている。

```ts
const response = await leaderboards.getLeaderboardScores(2244472, {
  limit: 100,
});

for (const entry of response.data) {
  console.log(entry.rank, entry.modifiedScore, entry.player.name);
}
```

これは `PlayerScoreRepository` の item（`{ score, leaderboard }`）と形が違う。呼び出し側で混同しないように、型を分けている：

| 型                      | 出所                       | 形状                                |
| ----------------------- | -------------------------- | ----------------------------------- |
| `PlayerScoreEntry`      | `players/{id}/scores`      | `{ score, leaderboard }`            |
| `LeaderboardScoreEntry` | `leaderboards/{id}/scores` | フラット `Score`（`player` を含む） |

`sort` の enum は `score` / `timeSet`。既定は `score` desc（この層で明示している）。`hideNA` は未登録スコアを隠すフラグ。

## 使用例

### 更新候補の譜面情報を揃えて表示する

```ts
import { useLeaderboardRepository } from "../hooks/useLeaderboardRepository";

const leaderboards = useLeaderboardRepository();

interface ImprovementRow {
  leaderboard: Leaderboard;
  myScore: number;
  bestOtherScore: number;
  gap: number;
  by: string;
}

const buildRows = async (
  improvementCandidates: Array<[number, CompetitorScore[], number]>,
): Promise<ImprovementRow[]> => {
  const rows: ImprovementRow[] = [];

  for (const [leaderboardId, others, myScore] of improvementCandidates) {
    const leaderboard = await leaderboards.getLeaderboard(leaderboardId);
    const best = others.reduce((a, b) => (a.score > b.score ? a : b));

    rows.push({
      leaderboard,
      myScore,
      bestOtherScore: best.score,
      gap: best.score - myScore,
      by: best.playerName,
    });
  }

  return rows.sort((a, b) => b.gap - a.gap);
};
```

### 未プレイ譜面について「誰が・どのスコアで」を表示する

```ts
for (const [leaderboardId, others] of competitorScores) {
  if (myScores.has(leaderboardId)) continue;

  const leaderboard = await leaderboards.getLeaderboard(leaderboardId);
  const actual = await scores.getScoreByHash(
    playerId,
    leaderboard.map.hash,
    leaderboard.difficulty.gameMode,
    leaderboard.difficulty.difficulty,
  );

  if (actual === null) {
    console.log(
      `${leaderboard.map.songName} [${leaderboard.difficulty.rawDifficulty}]`,
      "未プレイ",
      `最高: ${Math.max(...others.map((o) => o.score))}`,
    );
  } else {
    console.log(
      `${leaderboard.map.songName}`,
      `自分のスコア ${actual.modifiedScore}（トップ50外）`,
    );
  }
}
```

### 譜面のトップ100ランキングから自分の位置を確認する

```ts
const response = await leaderboards.getLeaderboardScores(leaderboardId, {
  limit: 100,
  sort: "score",
  sortDirection: "desc",
});

const mine = response.data.find((entry) => entry.player.id === playerId);

if (mine) {
  console.log(`この譜面での順位: ${mine.rank}, PP: ${mine.pp}`);
} else {
  console.log("この譜面のトップ100に自分のスコアはない");
}
```

### ハッシュから Leaderboard ID を解決する

```ts
// スコア payload に leaderboard が含まれない場合、ハッシュから復元する
const leaderboard = await leaderboards.getLeaderboardByHash(
  entryHash,
  gameMode,
  difficulty,
);

const leaderboardId = leaderboard.id;
```

## 注意点

- `getLeaderboard` は `data` で包まれた形状ではない。`PaginatedResponse<Leaderboard>` と誤って型を付けると `response.data` が `undefined` になる。
- `getLeaderboardScores` の item に `leaderboard` フィールドはない。Leaderboard ID は呼び出し側で既に知っている値を使う。
- 100件を超えて見たい場合は `page` を増やす。`metadata.totalPages` を参照する。
- `realmId` を省略すると active realm が使われる。比較は同一 realm で揃える必要がある。

## 検証済み事実

- `GET /api/v2/leaderboards/{id}` はフラットオブジェクト。実レスポンスに `legacyMaxScore` が含まれる（スキーマに記載なし）。
- `GET /api/v2/leaderboards/{id}/scores` の item はフラット `Score`（`player` を含む）。
- `GET /api/v2/leaderboards/hash/{hash}/{mode}/{difficulty}` はフラットオブジェクト。
- `limit` 最大100、`sort` の enum は `score` / `timeSet`。
