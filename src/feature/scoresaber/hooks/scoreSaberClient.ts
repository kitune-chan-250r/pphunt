import axios, { type AxiosInstance } from "axios";
import type { ApiErrorResponse } from "../types/ScoreSaber";

export const SCORESABER_BASE_URL = "https://scoresaber.com";

/** ScoreSaber v2 caps `limit` at 100 on every paginated endpoint. */
export const MAX_LIMIT = 100;

export interface ScoreSaberClientOptions {
  /** Max in-flight requests at once. ScoreSaber rate-limits, so keep this small. */
  concurrency?: number;
  /** Extra attempts after the first failure. */
  maxRetries?: number;
  requestTimeoutMs?: number;
  /** Cache successful responses by URL so repeated fetches are free. */
  useCache?: boolean;
}

export interface ScoreSaberClient {
  get<T>(
    path: string,
    params?: Record<string, string | number | boolean>,
  ): Promise<T>;
  clearCache(): void;
}

const DEFAULT_CONCURRENCY = 6;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Minimal FIFO concurrency limiter (avoids firing 200 requests at once). */
const createLimiter = (concurrency: number) => {
  const queue: Array<() => void> = [];
  let active = 0;

  const pump = () => {
    if (active >= concurrency) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      });
      pump();
    });
};

const isRetryable = (error: unknown): boolean => {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  // 404 is a legitimate answer (player has no score on that leaderboard),
  // so never retry it.
  if (status === 404) return false;
  if (status === 429) return true;
  return status === undefined || status >= 500;
};

const retryDelayMs = (error: unknown, attempt: number): number => {
  if (axios.isAxiosError(error)) {
    const header = error.response?.headers?.["retry-after"];
    const retryAfter = Number(header);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
  }
  return Math.min(2 ** attempt * 500, 8000);
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const createScoreSaberClient = (
  options: ScoreSaberClientOptions = {},
): ScoreSaberClient => {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const http: AxiosInstance = axios.create({
    baseURL: SCORESABER_BASE_URL,
    timeout: options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const limit = createLimiter(concurrency);
  const cache = new Map<string, unknown>();
  const caching = options.useCache ?? true;

  const requestOnce = async (url: string): Promise<unknown> => {
    const response = await http.get(url);
    return response.data;
  };

  const get = async <T>(
    path: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      search.set(key, String(value));
    }
    // Support paths that already carry a query string.
    const url = search.size > 0 ? `${path}?${search.toString()}` : path;

    if (caching && cache.has(url)) {
      return cache.get(url) as T;
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        const data = await limit(() => requestOnce(url));
        if (caching) cache.set(url, data);
        return data as T;
      } catch (error) {
        if (attempt >= maxRetries || !isRetryable(error)) {
          throw error;
        }
        await wait(retryDelayMs(error, attempt + 1));
      }
    }
  };

  return {
    get,
    clearCache: () => cache.clear(),
  };
};

/** True when a request failed with 404, i.e. the player has no score there. */
export const isNotFound = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 404;

export const apiErrorBody = (error: unknown): ApiErrorResponse | null => {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as ApiErrorResponse) ?? null;
  }
  return null;
};
