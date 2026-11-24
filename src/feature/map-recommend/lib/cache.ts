/**
 * 永続キャッシュ（DESIGN.md §3.4 / Phase 2）。
 *
 * ScoreSaber のレスポンスは `scoreSaberClient` のメモリキャッシュでも
 * 再利用されるが、ページを再読み込みすると消えてしまう。近傍プレイヤーの
 * スコアやリーダーボードのメタデータは変化が遅いため、IndexedDB に
 * TTL 付きで保存し、再分析時は差分だけを取得できるようにする。
 *
 * IndexedDB が使えない環境（プライベートモード、テスト環境など）では
 * すべての操作が静かに失敗し、通常のネットワーク取得にフォールバックする。
 */

const DB_NAME = "pphunt-cache";
const DB_VERSION = 1;
const STORE_NAME = "entries";

/** 他プレイヤーのスコアプロファイルの TTL（数時間）。 */
export const NEIGHBOUR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** リーダーボードメタデータの TTL（数日）。 */
export const LEADERBOARD_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  key: string;
  value: T;
  expiresAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "key" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
};

const runRequest = <T>(request: IDBRequest<T>): Promise<T | null> =>
  new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
  });

/** TTL 内のキャッシュがあればその値を、無ければ null を返す。 */
export const getPersistentCache = async <T>(
  key: string,
): Promise<T | null> => {
  const db = await openDatabase();
  if (!db) return null;
  try {
    const entry = await runRequest(
      db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(key) as IDBRequest<CacheEntry<T> | undefined>,
    );
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) return null;
    return entry.value;
  } catch {
    return null;
  }
};

/** 値を TTL 付きで保存する。失敗しても例外は投げない。 */
export const setPersistentCache = async (
  key: string,
  value: unknown,
  ttlMs: number,
): Promise<void> => {
  const db = await openDatabase();
  if (!db) return;
  try {
    const entry: CacheEntry<unknown> = {
      key,
      value,
      expiresAt: Date.now() + ttlMs,
    };
    await runRequest(
      db
        .transaction(STORE_NAME, "readwrite")
        .objectStore(STORE_NAME)
        .put(entry) as IDBRequest<IDBValidKey>,
    );
  } catch {
    // キャッシュは最適化であり、失敗しても分析は継続できる。
  }
};
