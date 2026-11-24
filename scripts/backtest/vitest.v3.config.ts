import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// RecommendMap v3 バックテスト専用設定（DESIGN_V3.md §6）。
// 層化版（vitest.stratified.config.ts）とは独立に、v3 版テスト
// （scripts/backtest/v3.test.ts）だけを Node 環境で実行する。
// ライブ API を叩くためタイムアウトは3時間取る。
export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  test: {
    environment: "node",
    include: ["scripts/backtest/v3.test.ts"],
    testTimeout: 10_800_000,
    hookTimeout: 10_800_000,
  },
});
