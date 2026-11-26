/**
 * Build-time constants injected by vite.config.ts via `define`.
 * Declared globally here so TypeScript accepts them wherever they are read.
 */
declare global {
  const __APP_VERSION__: string;
  const __GIT_SHA__: string;
  const __BUILD_DATE__: string;
}

export {};
