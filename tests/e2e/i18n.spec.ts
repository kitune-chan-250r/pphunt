import { expect, test, type Browser, type Page } from "@playwright/test";

const withBrowserLocale = async (
  browser: Browser,
  locale: string,
  run: (page: Page) => Promise<void>,
) => {
  const context = await browser.newContext({
    locale,
    colorScheme: "light",
  });
  try {
    await run(await context.newPage());
  } finally {
    await context.close();
  }
};

const browserLocaleCases = [
  {
    locale: "en-US",
    language: "en",
    selector: "Display language",
    selectedLanguage: "English",
    placeholder: "Enter a player name to search",
    guide: "PP Guide: How ScoreSaber PP works and how to gain it efficiently",
    title: "PPHunt | Recommended ScoreSaber maps for earning PP (Beat Saber)",
  },
  {
    locale: "en-GB",
    language: "en",
    selector: "Display language",
    selectedLanguage: "English",
    placeholder: "Enter a player name to search",
    guide: "PP Guide: How ScoreSaber PP works and how to gain it efficiently",
    title: "PPHunt | Recommended ScoreSaber maps for earning PP (Beat Saber)",
  },
  {
    locale: "ja-JP",
    language: "ja",
    selector: "表示言語",
    selectedLanguage: "日本語",
    placeholder: "検索するプレイヤー名を入力",
    guide: "PPガイド：ScoreSaberのPPの仕組みと効率的な上げ方",
    title: "PPHunt | ScoreSaber PP稼ぎ向けおすすめ譜面ツール（Beat Saber）",
  },
  {
    locale: "fr-FR",
    language: "ja",
    selector: "表示言語",
    selectedLanguage: "日本語",
    placeholder: "検索するプレイヤー名を入力",
    guide: "PPガイド：ScoreSaberのPPの仕組みと効率的な上げ方",
    title: "PPHunt | ScoreSaber PP稼ぎ向けおすすめ譜面ツール（Beat Saber）",
  },
] as const;

for (const expected of browserLocaleCases) {
  test(`ブラウザー言語「${expected.locale}」に応じた初期表示と未保存を確認する`, async ({
    browser,
  }) => {
    await withBrowserLocale(browser, expected.locale, async (page) => {
      await page.goto("/");

      await expect(page.locator("html")).toHaveAttribute(
        "lang",
        expected.language,
      );
      await expect(page).toHaveTitle(expected.title);
      await expect(
        page.getByRole("combobox", { name: expected.selector }),
      ).toHaveText(expected.selectedLanguage);
      await expect(
        page.getByRole("combobox", { name: /検索するプレイヤー名|Search players/ }),
      ).toHaveAttribute("placeholder", expected.placeholder);
      await expect(page.getByRole("link", { name: expected.guide })).toBeVisible();
      await expect(page.getByText("PPHUNT", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => localStorage.getItem("pphunt-language")),
        )
        .toBeNull();
    });
  });
}

test("言語選択で表示文言・アクセシブル名・タイトルが更新される", async ({
  browser,
}) => {
  await withBrowserLocale(browser, "en-US", async (page) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Switch color theme" })).toBeVisible();
    await expect(page.getByRole("link", { name: /PP Guide:/ })).toBeVisible();
    await expect(page.getByText("PPHUNT", { exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: "Display language" }).click();
    await expect(page.getByRole("option", { name: "日本語" })).toBeVisible();
    await page.getByRole("option", { name: "日本語" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page).toHaveTitle(
      "PPHunt | ScoreSaber PP稼ぎ向けおすすめ譜面ツール（Beat Saber）",
    );
    await expect(
      page.getByRole("combobox", { name: "表示言語" }),
    ).toHaveText("日本語");
    await expect(
      page.getByRole("combobox", { name: "検索するプレイヤー名" }),
    ).toHaveAttribute("placeholder", "検索するプレイヤー名を入力");
    const themeButton = page.getByRole("button", {
      name: "カラーテーマを切り替え",
    });
    await expect(themeButton).toBeVisible();
    await themeButton.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "ダークモードに切り替え",
    );
    await expect(
      page.getByRole("link", { name: /PPガイド：/ }),
    ).toBeVisible();
    await expect(page.getByText("PPHUNT", { exact: true })).toBeVisible();
  });
});

test("明示選択した日本語は英語ブラウザー設定より優先され再読み込み後も保持される", async ({
  browser,
}) => {
  await withBrowserLocale(browser, "en-US", async (page) => {
    await page.goto("/");

    await page.getByRole("combobox", { name: "Display language" }).click();
    await page.getByRole("option", { name: "日本語" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("pphunt-language")),
      )
      .toBe("ja");

    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(
      page.getByRole("combobox", { name: "表示言語" }),
    ).toHaveText("日本語");
  });
});

test("保存済みの英語設定は日本語ブラウザー設定より優先される", async ({
  browser,
}) => {
  await withBrowserLocale(browser, "ja-JP", async (page) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem("pphunt-language", "en"),
    );
    await page.reload();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("combobox", { name: "Display language" }),
    ).toHaveText("English");
    await expect(page.getByRole("link", { name: /PP Guide:/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Display language" }).click();
    await page.getByRole("option", { name: "日本語" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("pphunt-language")),
      )
      .toBe("ja");
  });
});
