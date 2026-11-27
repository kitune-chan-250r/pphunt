import { describe, expect, it } from "vitest";
import { BUILD_INFO, formatBuildInfo } from "./buildInfo";

describe("formatBuildInfo", () => {
  it("版数・コミットSHA・ビルド日を「v<版数> · <SHA> · <日付>」に整形する", () => {
    expect(formatBuildInfo("1.0.0", "a1b2c3d", "2026-11-26")).toBe(
      "v1.0.0 · a1b2c3d · 2026-11-26",
    );
  });

  it("SHA が dev フォールバックでも同じ形式になる", () => {
    expect(formatBuildInfo("0.0.0", "dev", "2026-01-01")).toBe(
      "v0.0.0 · dev · 2026-01-01",
    );
  });
});

describe("BUILD_INFO", () => {
  it("注入値・フォールバックのどちらでも形式が崩れない", () => {
    expect(BUILD_INFO).toMatch(/^v\d+\.\d+\.\d+ · \S+ · \d{4}-\d{2}-\d{2}$/);
  });
});
