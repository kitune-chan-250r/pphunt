# `usePlayerRepository.ts` — プレイヤー取得

## 役割

「プレイヤー情報」と「ランキング周辺のプレイヤー」を取得する層。スコア取得とは分離されている。ここは**少数のリクエストで200人の集合を作る**担当で、各プレイヤーのスコアは `usePlayerScoreRepository` が担当する。

## インターフェース

```ts
export interface PlayerRepository {
  getPlayer(playerId: string): Promise<RankedPlayer>;
  getPlayersAroundRank(rank: number, halfSpan?: number): Promise<RankedPlayer[]>;
  searchPlayers(searchString: string, limit?: number): Promise<RankedPlayer[]>;
}

export const usePlayerRepository = (client?: ScoreSaberClient): PlayerRepository;
```

`RankedPlayer` は `types/PlayerSearchResult.ts` の `Player` の別名。プレイヤー一覧APIと単一プレイヤーAPIが同じ形状（`stats.rank`、`stats.countryRank` を持つ）なので、両方に同じ型を使える。

## 解説

### `getPlayer(playerId)`

`GET /api/v2/players/{id}`。このエンドポイントは `data` で包まない**フラットなオブジェクト**を返す。

```ts
const player = await client.get<RankedPlayer>(`/api/v2/players/${playerId}`);
```

実レスポンスには `badges`、`bio`、`vanity` など追加フィールドがあるが、型は比較に必要なものだけを絞っている。

### `getPlayersAroundRank(rank, halfSpan = 100)`

`GET /api/v2/players` を `sort=rank&sortDirection=asc` で、対象順位を中心に前後 `halfSpan` 人分取得する。

**なぜページ計算で中心を指定するのか。** `pivot` パラメータのスキーマ上の意味は「認証済みビューワーを中心にする」であり、任意の Player ID を中心にする機能ではない。認証なしで任意の順位を中心に取得する手段がないため、順位からページを計算する。

```ts
const pageForRank = (rank: number, limit: number): number =>
  Math.max(1, Math.ceil(rank / limit));
```

rank 1,234、halfSpan 100 の場合：

- 範囲 = 1,134〜1,334
- `firstPage = ceil(1134/100) = 12`
- `lastPage = ceil(1334/100) = 14`
- 3ページ（12, 13, 14）を取得 → 300人分の候補から200人に絞り込む

境界処理：

1. **重複**：同じプレイヤーが複数ページにまたがる可能性があるため `Set` で dedup する。
2. **不足**：300人取っても範囲外のプレイヤーが含まれるため、`stats.rank` が `[lowRank, highRank]` のものだけ残す。
3. **順序**：返す前に `stats.rank` ascending でソートする。API の並び順に依存しない。
4. **rank 1 付近**：`Math.max(1, rank - halfSpan)` で下限を1に固定する（rank 0 は存在しない）。

「ページが Global Rank 順で連続している」という前提に依存する設計なので、実レスポンスで順位と並び順を検証済み（page 13 → rank 1201–1300）。

### `searchPlayers(searchString, limit = 10)`

`GET /api/v2/players?search=...`。`search` は最小3文字。既存の `usePlayerSearch.ts`（debounce 350ms）から呼ばれる。

## 使用例

### 対象プレイヤーを中心に200人を集める

```ts
import { createScoreSaberClient } from "./scoreSaberClient";
import { usePlayerRepository } from "./usePlayerRepository";

const client = createScoreSaberClient({ concurrency: 6 });
const players = usePlayerRepository(client);

const target = await players.getPlayer("1922350521131465");
const nearby = await players.getPlayersAroundRank(target.stats.rank, 100);

console.log(nearby.length); // 201（上位100人 + 対象 + 下位100人）
console.log(nearby[0].stats.rank); // 1134
console.log(nearby.at(-1)!.stats.rank); // 1334
```

### 分析層：NearbyPlayerService

```ts
import { usePlayerRepository } from "../hooks/usePlayerRepository";
import { usePlayerScoreRepository } from "../hooks/usePlayerScoreRepository";

export const useNearbyPlayerService = () => {
  const playerRepo = usePlayerRepository();
  const scoreRepo = usePlayerScoreRepository();

  const collect = async (playerId: string) => {
    const target = await playerRepo.getPlayer(playerId);
    const nearby = await playerRepo.getPlayersAroundRank(
      target.stats.rank,
      100,
    );

    // 200件を一度に流さない：リミッターが同時6で順に流す
    const scoresByPlayer = new Map<string, PlayerScoreEntry[]>();

    for (const player of nearby) {
      const response = await scoreRepo.getTopScores(player.id, 50);
      scoresByPlayer.set(player.id, response.data);
    }

    return { target, nearby, scoresByPlayer };
  };

  return { collect };
};
```

### 上位プレイヤーの順位変動を追う

```ts
const top = await players.getPlayersAroundRank(1, 50);

for (const player of top) {
  if (player.stats.rankChange !== null) {
    console.log(
      `${player.name}: rank ${player.stats.rank} (${player.stats.rankChange})`,
    );
  }
}
```

### 検索結果からそのまま順位中心の集合へ

```ts
const results = await players.searchPlayers("Brazy");
if (results.length === 0) return;

const found = results[0];
const nearby = await players.getPlayersAroundRank(found.stats.rank, 100);
```

## 注意点

- `getPlayersAroundRank` は範囲内のページ数だけリクエストする（halfSpan 100、limit 100なら 2〜3リクエスト）。これを `Promise.all` で並列化しないこと。リミッターが順に流す設計に任せる。
- 非アクティブプレイヤーは既定で含まれない。含めたい場合は `includeInactive` パラメータが必要だが、この層には露出していない（必要なら `client.get` を直接使うか、オプションを追加する）。
- `stats.rank` は対象の realm における順位。`realmId` を渡さない場合、API は active realm を使う。

## 検証済み事実

- `limit` 最大100、`sort` の enum に `rank` あり、`sortDirection` は `asc`/`desc`。
- `pivot` は `player`/`friends` の列挙値で、`player` は認証済みビューワー中心。任意の Player ID 中心ではない。
- 実レスポンス：page 13 @ limit 100 → rank 1201–1300（ページが Global Rank 順で連続していることを確認）。
