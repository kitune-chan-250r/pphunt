# `useScoreSaber.ts` — 3つのリポジトリを束ねるファサード

## 役割

データ取得層の入口。単一の共有クライアントを生成し、3つのリポジトリ（プレイヤー / プレイヤースコア / リーダーボード）をまとめて返す。既存の `searchPlayers` は呼び出し側（`usePlayerSearch.ts`）を変えないよう、薄いラッパーとして残している。

## インターフェース

```ts
export interface ScoreSaberInterface {
  searchPlayers(searchString: string): Promise<Player[]>;
  playerRepository: PlayerRepository;
  playerScoreRepository: PlayerScoreRepository;
  leaderboardRepository: LeaderboardRepository;
}

export const useScoreSaber = (): ScoreSaberInterface;
```

## 解説

### 共有クライアントを1回だけ作る

```ts
const client = useMemo(() => createScoreSaberClient({ concurrency: 6 }), []);
```

`useMemo` でフックの生存中1回だけクライアントを作る。ここで毎回 `createScoreSaberClient()` を呼ぶと、リポジトリごとに別々のキャッシュと別々のリミッターを持つことになり、キャッシュが効かず同時数も分散する。

各リポジトリは引数でクライアントを受け取る（`usePlayerRepository(client)`）。既定引数で単独生成もできるが、ファサード経由で使う限りは共有クライアントが渡される。

### 返す型

`ReturnType<typeof usePlayerRepository>` として書いているのは、リポジトリのインターフェースを再定義せずに、フックの返り値の型をそのまま露出するため。呼び出し側は `playerRepository.getPlayersAroundRank(...)` のようにメソッド名でアクセスできる。

### 既存呼び出しとの互換

`usePlayerSearch.ts` は `searchPlayers` だけを使っている。ファサードの変更後もそのまま動く。

```ts
const { searchPlayers } = useScoreSaber();
const players = await searchPlayers("Brazy");
```

## 使用例

### 分析層（NearbyPlayerService）

```ts
import { useScoreSaber } from "../hooks/useScoreSaber";
import type { PlayerScoreEntry, RankedPlayer } from "../types/ScoreSaber";

export const useNearbyPlayerService = () => {
  const { playerRepository, playerScoreRepository } = useScoreSaber();

  const collect = async (playerId: string) => {
    const target = await playerRepository.getPlayer(playerId);
    const nearby = await playerRepository.getPlayersAroundRank(
      target.stats.rank,
      100,
    );

    const topScores = new Map<string, PlayerScoreEntry[]>();

    for (const player of nearby) {
      const response = await playerScoreRepository.getTopScores(player.id, 50);
      topScores.set(player.id, response.data);
    }

    return { target, nearby, topScores };
  };

  return { collect };
};
```

### 分析層（ScoreComparisonService）

```ts
import { useScoreSaber } from "../hooks/useScoreSaber";

interface CompetitorScore {
  playerId: string;
  playerName: string;
  globalRank: number;
  leaderboardId: number;
  score: number;
}

export const useScoreComparisonService = () => {
  const { playerScoreRepository, leaderboardRepository } = useScoreSaber();

  const compare = async (
    playerId: string,
    nearby: RankedPlayer[],
    topScores: Map<string, PlayerScoreEntry[]>,
  ) => {
    // 5-1: 自分のトップ50を Map で管理
    const myTop = await playerScoreRepository.getTopScores(playerId, 50);
    const myScores = new Map<number, number>();
    for (const item of myTop.data) {
      myScores.set(item.leaderboard.id, item.score.modifiedScore);
    }

    // 5-2: 他プレイヤーのスコアを Leaderboard ID 単位で集約
    const competitorScores = new Map<number, CompetitorScore[]>();

    for (const player of nearby) {
      for (const item of topScores.get(player.id) ?? []) {
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

    // 5-3-A: 自分のトップ50に含まれない譜面
    const unlistedMaps = [...competitorScores.entries()].filter(
      ([leaderboardId]) => !myScores.has(leaderboardId),
    );

    // 5-3-B: 他人のスコアが自分より高い譜面
    const improvementCandidates = [...competitorScores.entries()].filter(
      ([leaderboardId, scores]) => {
        const mine = myScores.get(leaderboardId);
        if (mine === undefined) return false;
        return scores.some((item) => item.score > mine);
      },
    );

    // 5-4: トップ50外 ≠ 未プレイ。個別確認して3分類にする
    const classifications = new Map<number, "UNPLAYED" | "OUTSIDE_TOP50">();

    for (const [leaderboardId] of unlistedMaps) {
      const leaderboard =
        await leaderboardRepository.getLeaderboard(leaderboardId);
      const actual = await playerScoreRepository.getScoreByHash(
        playerId,
        leaderboard.map.hash,
        leaderboard.difficulty.gameMode,
        leaderboard.difficulty.difficulty,
      );
      classifications.set(
        leaderboardId,
        actual === null ? "UNPLAYED" : "OUTSIDE_TOP50",
      );
    }

    return {
      myScores,
      competitorScores,
      unlistedMaps,
      improvementCandidates,
      classifications,
    };
  };

  return { compare };
};
```

### React コンポーネントから使う

```tsx
import { useEffect, useState } from "react";
import { useScoreSaber } from "../hooks/useScoreSaber";

export const ComparisonPanel = ({ playerId }: { playerId: string }) => {
  const { playerRepository, playerScoreRepository } = useScoreSaber();
  const [target, setTarget] = useState<RankedPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const player = await playerRepository.getPlayer(playerId);
        if (cancelled) return;
        setTarget(player);
      } catch (err) {
        if (!cancelled) setError("プレイヤー取得に失敗しました");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerRepository, playerId]);

  if (error) return <p>{error}</p>;
  if (!target) return <p>読み込み中…</p>;

  return (
    <p>
      {target.name} / Global Rank {target.stats.rank}
    </p>
  );
};
```

## 注意点

- **フックの返り値は安定しない**。`useScoreSaber()` を呼ぶコンポーネントが再レンダリングすると、返されるオブジェクトは毎回新しくなる。`useEffect` の依存配列に `playerRepository` を入れると、リポジトリのメソッドは `useCallback` で安定化されているため実害はないが、ファサードのオブジェクト自体を依存にすると再実行される。依存には使うメソッド単体を入れるか、`useMemo` で包んだ上で使う。
- **キャッシュはフックの生存中に限定される**。ページ遷移でファサードが作り直されるとキャッシュは失われる。200人分のトップ50を「一度取得してキャッシュし、以後は比較だけ」という構成にしたいなら、クライアントをモジュールスコープで持つ（フックの外で `createScoreSaberClient()` を呼ぶ）のが確実。

```ts
// モジュールスコープの共有クライアント：フックの再生成を跨いでキャッシュが残る
const sharedClient = createScoreSaberClient({ concurrency: 6 });

export const useScoreSaber = (): ScoreSaberInterface => {
  const playerRepository = usePlayerRepository(sharedClient);
  const playerScoreRepository = usePlayerScoreRepository(sharedClient);
  const leaderboardRepository = useLeaderboardRepository(sharedClient);

  return { playerRepository, playerScoreRepository, leaderboardRepository };
};
```

- 200人のトップ50取得（200リクエスト）と個別スコア確認（譜面数分）で同時数の要求が違う。大量取得用に `concurrency` を上げた別クライアントを用意するとよい。

## 検証済み事実

- 読み取りエンドポイントに認証は不要。
- `search` は最小3文字（既存の debounce 350ms と組み合わせて使う）。
