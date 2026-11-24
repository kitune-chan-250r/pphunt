import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// バックテスト専用設定（DESIGN.md §3.6）。
// リポジトリ標準の vitest.config.ts（src/**/*.test.ts のみ）とは独立に、
// scripts/backtest 配下のテストだけを Node 環境で実行する。
// ライブ API を叩くためタイムアウトは generous に取る。
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    environment: "node",
    include: ["scripts/backtest/*.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
