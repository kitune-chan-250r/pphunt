import { describe, expect, it } from "vitest";
import { ApiBudget, HARD_API_BUDGET } from "./apiBudget";

describe("ApiBudget", () => {
  it("既定の上限は155回", () => {
    expect(new ApiBudget().limit).toBe(HARD_API_BUDGET);
    expect(HARD_API_BUDGET).toBe(155);
  });

  it("消費した分だけ残りが減る", () => {
    const budget = new ApiBudget(10);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume(4)).toBe(true);
    expect(budget.used).toBe(5);
    expect(budget.remaining).toBe(5);
  });

  it("上限を超える消費は失敗し、消費量は変わらない", () => {
    const budget = new ApiBudget(5);
    expect(budget.tryConsume(5)).toBe(true);
    expect(budget.tryConsume(1)).toBe(false);
    expect(budget.used).toBe(5);
    expect(budget.remaining).toBe(0);
  });

  it("まとめて消費する場合も上限を原子的に守る", () => {
    const budget = new ApiBudget(5);
    expect(budget.tryConsume(3)).toBe(true);
    expect(budget.tryConsume(3)).toBe(false);
    expect(budget.used).toBe(3);
    expect(budget.tryConsume(2)).toBe(true);
    expect(budget.used).toBe(5);
  });

  it("不正な消費量は受け付けない", () => {
    const budget = new ApiBudget(5);
    expect(budget.tryConsume(0)).toBe(false);
    expect(budget.tryConsume(-1)).toBe(false);
    expect(budget.tryConsume(Number.NaN)).toBe(false);
    expect(budget.used).toBe(0);
  });

  it("予約分を残した消費では、予約を割り込む消費が失敗する", () => {
    const budget = new ApiBudget(155);
    // hash 確認用に50回を予約し、近傍フェーズは105回まで。
    expect(budget.remainingAboveReserve(50)).toBe(105);
    expect(budget.tryConsumeAboveReserve(105, 50)).toBe(true);
    expect(budget.tryConsumeAboveReserve(1, 50)).toBe(false);
    // 予約分自体は通常消費で使える。
    expect(budget.tryConsume(50)).toBe(true);
    expect(budget.remaining).toBe(0);
  });
});
