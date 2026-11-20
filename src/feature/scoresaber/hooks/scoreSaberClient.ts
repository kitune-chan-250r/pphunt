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

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MINIMUM_REQUEST_INTERVAL_MS = 300;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 60_000;

interface RequestLimiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  pause(durationMs: number): void;
}

/** FIFO limiter for both in-flight concurrency and request start frequency. */
const createLimiter = (concurrency: number): RequestLimiter => {
  const queue: Array<() => void> = [];
  let active = 0;
  let nextRequestAt = 0;
  let pausedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const pump = () => {
    if (timer !== undefined || active >= concurrency || queue.length === 0) {
      return;
    }

    const waitMs = Math.max(nextRequestAt, pausedUntil) - Date.now();
    if (waitMs > 0) {
      timer = setTimeout(() => {
        timer = undefined;
        pump();
      }, waitMs);
      return;
    }

    const run = queue.shift();
    if (!run) return;

    active += 1;
    nextRequestAt = Date.now() + DEFAULT_MINIMUM_REQUEST_INTERVAL_MS;
    run();
    pump();
  };

  return {
    run: <T>(task: () => Promise<T>): Promise<T> =>
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
      }),
    pause: (durationMs) => {
      if (durationMs <= 0) return;
      pausedUntil = Math.max(pausedUntil, Date.now() + durationMs);
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pump();
    },
  };
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

const getRetryAfterMs = (error: unknown): number | undefined => {
  if (!axios.isAxiosError(error)) return undefined;

  const header = error.response?.headers?.["retry-after"];
  if (typeof header !== "string" && typeof header !== "number") {
    return undefined;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(seconds, 0) * 1000;

  const retryAt = Date.parse(String(header));
  return Number.isNaN(retryAt)
    ? undefined
    : Math.max(retryAt - Date.now(), 0);
};

const retryDelayMs = (error: unknown, attempt: number): number => {
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter !== undefined && retryAfter > 0) return retryAfter;
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

    const requestOnce = async (): Promise<unknown> => {
      try {
        const response = await http.get(url);
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          limit.pause(
            getRetryAfterMs(error) || DEFAULT_RATE_LIMIT_COOLDOWN_MS,
          );
        }
        throw error;
      }
    };

    for (let attempt = 0; ; attempt += 1) {
      try {
        const data = await limit.run(requestOnce);
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
