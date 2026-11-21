# `scoreSaberClient.ts` — 共有 HTTP クライアント

## 役割

すべてのリポジトリが共有する HTTP クライアント。リクエストの**同時数制限**、**リトライ**、**キャッシュ**をこの1ファイルに集約している。リポジトリ側は `client.get(path, params)` を呼ぶだけで、レート制限や重複取得の心配をしなくて済む。

## 公開しているもの

```ts
export const SCORESABER_BASE_URL = "https://scoresaber.com";
export const MAX_LIMIT = 100; // v2 のページネーション上限

export interface ScoreSaberClientOptions {
  concurrency?: number; // 既定 4
  maxRetries?: number; // 既定 3（初回失敗後の追加試行数）
  requestTimeoutMs?: number; // 既定 15000
  useCache?: boolean; // 既定 true
}

export interface ScoreSaberClient {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<T>;
  clearCache(): void;
}

export const createScoreSaberClient: (
  options?: ScoreSaberClientOptions,
) => ScoreSaberClient;
export const isNotFound: (error: unknown) => boolean;
export const apiErrorBody: (error: unknown) => ApiErrorResponse | null;
```

## 解説

### 1. リクエスト頻度と同時数の制限（FIFO リミッター）

200人のトップスコアを取得する処理では、同時数だけを制限しても、応答が速い間は短時間に多数のリクエストが送信される。添付HARでは、約6秒で99件のプレイヤー要求が成功した後、429が連続し、`Retry-After` ヘッダーもありませんでした。

FIFO キューは `concurrency` 以下の同時実行数に加え、リクエスト開始間隔を300ms以上に保つ。並列取得を許可しながら、開始頻度を毎秒約3.3件に抑える。

```ts
const limit = createLimiter(concurrency);
const data = await limit.run(() => requestOnce(url));
```

- キューに積まれた順に実行される（順序が保証される）
- 同時数に空きがあっても、前回の開始から既定300msが経つまで次の要求を開始しない
- 429を受け取ると、同じクライアントのキュー全体を `Retry-After`（なければ60秒）の期間だけ停止する

アプリでは `useScoreSaber` がモジュールスコープのクライアントを共有する。別々のクライアントを並行して作ると、それぞれ独立したキューになるため、同じレート制限を共有するAPIに対しては避ける。

### 2. リトライ

`isRetryable` の判定：

| 状況                                | リトライ   | 理由                                             |
| ----------------------------------- | ---------- | ------------------------------------------------ |
| 429                                 | する       | `Retry-After` を尊重し、キュー全体を停止          |
| 5xx                                 | する       | 一時的なサーバ障害                               |
| ネットワークエラー（response なし） | する       | 一時障害                                         |
| **404**                             | **しない** | 「未プレイ」という正しい回答。リトライしても無駄 |
| 400 / 401                           | しない     | パラメータまたは認証の問題。リトライで解決しない |

`Retry-After` は秒数とHTTP日時形式の両方を解釈する。ヘッダーがない429ではキュー全体を60秒停止し、個々の再試行は指数バックオフ（1s → 2s → 4s、上限8s）を行う。

```ts
for (let attempt = 0; ; attempt += 1) {
  try {
    const data = await limit.run(() => requestOnce(url));
    if (caching) cache.set(url, data);
    return data as T;
  } catch (error) {
    if (attempt >= maxRetries || !isRetryable(error)) throw error;
    await wait(retryDelayMs(error, attempt + 1));
  }
}
```

注意点：リトライは**リミッターの内側**で待たない。`wait()` は `limit.run()` の外（`get` のループ内）で行われるため、バックオフ中にスロットが占有されない。429後は再試行の待機が終わっても、共有キューの停止が解除されるまで送信されない。

### 3. キャッシュ

キーは完全な URL（パス + クエリ）。同じURLへの再取得はネットワークにいかない。

```ts
if (caching && cache.has(url)) return cache.get(url) as T;
```

これは設計上重要。分析層で「同じLeaderboard IDの重複取得を避ける」という要件があるが、URLキーのキャッシュによって呼び出し側で `Set` を管理しなくても重複が防げる。

ただしキャッシュは**永続**ではない（プロセス生存中のみ）。スコアは更新され続けるので、長時間保持したくない場合は `clearCache()` で明示的に無効化する。

```ts
client.clearCache();
```

### 4. `isNotFound` と `apiErrorBody`

404 を「例外」として扱うか「データ」として扱うかの分岐を、呼び出し側が書けるようにする補助関数。

```ts
try {
  const score = await client.get<Score>(path);
  // スコアが存在する
} catch (error) {
  if (isNotFound(error)) {
    // 未プレイ
  } else {
    const body = apiErrorBody(error);
    console.error(body?.message); // 400/401/429/500 の詳細
  }
}
```

`usePlayerScoreRepository.getScoreByHash` はこの 404 を内部で `null` に変換しているため、通常は `isNotFound` を明示的に使う必要はない。リポジトリを通さない生パスを呼ぶときに使う。

## 使用例

### 基本的な使い方

```ts
import { createScoreSaberClient } from "./scoreSaberClient";
import type { PaginatedResponse, RankedPlayer } from "../types/ScoreSaber";

const client = createScoreSaberClient({ concurrency: 6 });

const response = await client.get<PaginatedResponse<RankedPlayer>>(
  "/api/v2/players",
  { page: 13, limit: 100, sort: "rank", sortDirection: "asc" },
);

console.log(response.metadata);
// { page: 13, itemsPerPage: 100, totalItems: 37094, totalPages: 12365 }
console.log(response.data[0].stats.rank); // 1201
```

### 分析層から使う例（200人のトップ50をキャッシュ済みで再取得しない）

```ts
import { createScoreSaberClient } from "./scoreSaberClient";
import type { PaginatedResponse, PlayerScoreEntry } from "../types/ScoreSaber";

const client = createScoreSaberClient({ concurrency: 6 });

const fetchTopScores = async (playerId: string) =>
  client.get<PaginatedResponse<PlayerScoreEntry>>(
    `/api/v2/players/${playerId}/scores`,
    { sort: "top", limit: 50 },
  );

// 1回目：ネットワークにいく
const first = await fetchTopScores("1922350521131465");

// 2回目：同じURLなのでキャッシュから返る（リクエスト数は増えない）
const again = await fetchTopScores("1922350521131465");
```

### 個別プレイヤー単位でリトライ可能にする例

`get` は内部でリトライするが、呼び出し側で「このプレイヤーは諦めて次に進む」という制御をしたいことがある。

```ts
const results: Array<{ playerId: string; scores: PlayerScoreEntry[] | null }> =
  [];

for (const player of nearbyPlayers) {
  try {
    const response = await client.get<PaginatedResponse<PlayerScoreEntry>>(
      `/api/v2/players/${player.id}/scores`,
      { sort: "top", limit: 50 },
    );
    results.push({ playerId: player.id, scores: response.data });
  } catch (error) {
    // 内部リトライを使い切ったプレイヤーは記録して継続
    console.warn(`skip ${player.id}: ${apiErrorBody(error)?.message ?? error}`);
    results.push({ playerId: player.id, scores: null });
  }
}
```

## 検証済み事実

- OpenAPI スキーマは `https://scoresaber.com/api/openapi.json`。`/api/docs/swagger.json` は Scalar の HTML ページを返すので**使えない**。
- この層の読み取りエンドポイントに認証は不要。
- `limit` はすべてのページネーションエンドポイントで最大100。
- 実レスポンスで page 13 @ limit 100（`sort=rank&sortDirection=asc`）が rank 1201–1300 を返すことを確認済み。
