import { expect, test } from "@playwright/test";

test("背景のASCIIアートがフルHD画面の横幅を満たす", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");

  const sky = page.locator('[aria-hidden="true"] pre').first();
  await expect
    .poll(() => sky.evaluate((element) => element.textContent?.length ?? 0))
    .toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready);

  const width = await sky.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.max(...Array.from(range.getClientRects(), (rect) => rect.width));
  });

  expect(width).toBeGreaterThanOrEqual(1920 * 0.95);
});
