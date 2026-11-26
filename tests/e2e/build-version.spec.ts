import { expect, test } from "@playwright/test";

test("ページ最下部にビルドバージョンが表示される", async ({ page }) => {
  await page.goto("/");

  const versionLine = page.getByText(
    /^v1\.0\.0 · \S+ · \d{4}-\d{2}-\d{2}$/,
  );
  await expect(versionLine).toBeVisible();

  // 最下部の要素であること（ページ末尾に配置されていること）を確認する
  const isLastInFlow = await versionLine.evaluate((element) => {
    let last = element;
    while (last.parentElement && last.parentElement.id !== "root") {
      last = last.parentElement;
    }
    const siblings = Array.from(last.parentElement?.children ?? []);
    return siblings[siblings.length - 1] === last;
  });
  expect(isLastInFlow).toBe(true);
});
