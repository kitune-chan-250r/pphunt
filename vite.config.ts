import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// Build identification: package.json is the single source of truth for the
// version. The commit SHA comes from Cloudflare Pages
// (CF_PAGES_COMMIT_SHA) when built there, falls back to the local git
// checkout, and finally to "dev" when neither is available.
const resolveGitSha = (): string => {
  const fromPages = process.env.CF_PAGES_COMMIT_SHA;
  if (fromPages) {
    return fromPages.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
};

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __GIT_SHA__: JSON.stringify(resolveGitSha()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api/scoresaber": {
        target: "https://scoresaber.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/scoresaber/, ""),
      },
      "/api/beatsaver": {
        target: "https://api.beatsaver.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/beatsaver/, ""),
      },
    },
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
