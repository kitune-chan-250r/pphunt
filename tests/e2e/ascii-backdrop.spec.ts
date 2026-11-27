import { expect, test, type Page } from "@playwright/test";

/**
 * 背景スカイ（[aria-hidden] 内の最初の pre）のテキストブロックの広がりを
 * Range の行矩形から測る。グリフのないセルも空白として行を構成するので、
 * テキストブロックの広がり = ASCIIアートが描かれている範囲とみなせる。
 * 未描画（テキストがまだ無い）場合は null を返す。
 */
const measureSkyExtent = async (page: Page) => {
  const sky = page.locator('[aria-hidden="true"] pre').first();
  await page.evaluate(() => document.fonts.ready);
  return sky.evaluate((element) => {
    if (!element.textContent) return null;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects());
    if (!rects.length) return null;
    return {
      width: Math.max(...rects.map((rect) => rect.width)),
      height: rects[rects.length - 1].bottom - rects[0].top,
      left: rects[0].left,
      top: rects[0].top,
    };
  });
};

/** スカイがビューポートの左上を起点に右端・下端まで届く状態になるまで待つ */
const expectSkyCovers = async (page: Page, width: number, height: number) => {
  await expect
    .poll(
      async () => {
        const extent = await measureSkyExtent(page);
        return (
          extent !== null &&
          extent.left <= 1 &&
          extent.top <= 1 &&
          extent.width >= width * 0.99 &&
          extent.height >= height * 0.99
        );
      },
      { timeout: 15_000 },
    )
    .toBe(true);
};

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

test.describe("背景のASCIIアートが画面全体を覆う", () => {
  const viewports = [
    { label: "モバイル（縦長）", width: 390, height: 844 },
    { label: "ウルトラワイド", width: 3440, height: 1440 },
    { label: "通常のデスクトップ", width: 1280, height: 800 },
  ];

  for (const { label, width, height } of viewports) {
    test(`${label} (${width}x${height}) で上下左右の端まで届く`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");

      await expectSkyCovers(page, width, height);
    });
  }

  test("リサイズ後に新しい画面サイズへ追従する", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expectSkyCovers(page, 1280, 800);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectSkyCovers(page, 390, 844);
  });
});
