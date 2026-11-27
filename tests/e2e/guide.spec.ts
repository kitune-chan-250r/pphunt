import { expect, test } from "@playwright/test";

// NOTE: ガイドページは public/guide/index.html として置かれた静的ファイルで、
// 本番（Cloudflare Pages）では /guide/ で配信される。一方、Vite dev サーバーは
// ディレクトリパス /guide/ に対して SPA フォールバック（アプリのシェル）を
// 返してしまうため、dev 前提の e2e では実ファイルのパス /guide/index.html で
// 内容を確認する（バイト列は本番の /guide/ と同一）。本番相当の配信は
// `vite preview`（ビルド成果物）で /guide/ → ガイドHTML になることを確認済み。
test.describe("PPガイドページ", () => {
  test("静的ガイドページがガイド本体を返す", async ({ page }) => {
    const response = await page.goto("/guide/index.html");
    expect(response?.ok()).toBeTruthy();

    // SPAシェルではなく、ガイド本体の見出しが返ること
    await expect(page.locator("h1")).toHaveText(
      "ScoreSaberでPPを稼ぐには？仕組みと効率的な上げ方ガイド",
    );
    await expect(page).toHaveTitle(/PPHunt/);

    // ツール本体への導線があること
    await expect(
      page.getByRole("link", { name: "PPHuntでおすすめ譜面を見る" }),
    ).toBeVisible();
  });

  test("トップページのフッターにガイドへのリンクがある", async ({ page }) => {
    await page.goto("/");
    const guideLink = page.getByRole("link", {
      name: "PPガイド：ScoreSaberのPPの仕組みと効率的な上げ方",
    });
    await expect(guideLink).toBeVisible();
    await expect(guideLink).toHaveAttribute("href", "/guide/");
  });
});
