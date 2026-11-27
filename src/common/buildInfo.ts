/**
 * Build identification shown as one quiet line at the bottom of the page.
 * The values are injected at build time by vite.config.ts (`define`); the
 * fallbacks keep non-Vite contexts (e.g. unit tests) working.
 */
export const formatBuildInfo = (
  version: string,
  gitSha: string,
  buildDate: string,
): string => `v${version} · ${gitSha} · ${buildDate}`;

export const BUILD_INFO: string = formatBuildInfo(
  typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  typeof __GIT_SHA__ === "string" ? __GIT_SHA__ : "dev",
  typeof __BUILD_DATE__ === "string"
    ? __BUILD_DATE__
    : new Date().toISOString().slice(0, 10),
);
