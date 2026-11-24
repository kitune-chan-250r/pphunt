import { describe, expect, it } from "vitest";
import { mmrRerank, type MmrItemKey } from "./diversity";

interface Item {
  name: string;
  value: number;
  key: MmrItemKey;
}

const item = (
  name: string,
  value: number,
  key: Partial<MmrItemKey> & { songId: string },
): Item => ({ name, value, key: { mapper: name, ...key } });

const rerank = (items: Item[], limit?: number) =>
  mmrRerank(items, {
    lambda: 0.3,
    limit,
    key: (i) => i.key,
    score: (i) => i.value,
  }).map((i) => i.name);

describe("mmrRerank", () => {
  it("demotes another difficulty of the same song below a distinct song", () => {
    const items = [
      item("a-expert", 100, {
        songId: "song-1",
        mapper: "mapper-x",
        characteristic: "Tech",
        starsBand: 10,
      }),
      item("a-hard", 99, {
        songId: "song-1",
        mapper: "mapper-x",
        characteristic: "Tech",
        starsBand: 9,
      }),
      item("b", 90, {
        songId: "song-2",
        mapper: "mapper-y",
        characteristic: "Speed",
        starsBand: 9,
      }),
    ];
    // Without MMR the order would be a-expert, a-hard, b. The same-song
    // penalty (1.0) pushes a-hard below b.
    expect(rerank(items)).toEqual(["a-expert", "b", "a-hard"]);
  });

  it("respects the limit and returns items in selection order", () => {
    const items = [
      item("one", 100, { songId: "s1" }),
      item("two", 90, { songId: "s2" }),
      item("three", 80, { songId: "s3" }),
    ];
    expect(rerank(items, 2)).toEqual(["one", "two"]);
  });

  it("keeps score order when there are no shared features", () => {
    const items = [
      item("low", 50, { songId: "s1", characteristic: "Tech", starsBand: 8 }),
      item("high", 100, { songId: "s2", characteristic: "Speed", starsBand: 9 }),
      item("mid", 75, { songId: "s3", characteristic: "Balanced", starsBand: 10 }),
    ];
    expect(rerank(items)).toEqual(["high", "mid", "low"]);
  });

  it("penalises the same mapper less than the same song", () => {
    const items = [
      item("first", 100, { songId: "s1", mapper: "same-mapper" }),
      item("same-mapper-song", 98, { songId: "s2", mapper: "same-mapper" }),
      item("same-song", 99, { songId: "s1", mapper: "other-mapper" }),
    ];
    const order = rerank(items);
    expect(order[0]).toBe("first");
    // Same-song penalty 1.0 > same-mapper penalty 0.5, so the
    // same-mapper item is selected before the same-song item despite
    // its slightly lower score.
    expect(order.indexOf("same-mapper-song")).toBeLessThan(
      order.indexOf("same-song"),
    );
  });

  it("handles empty input and a zero limit", () => {
    expect(rerank([])).toEqual([]);
    expect(rerank([item("x", 10, { songId: "s" })], 0)).toEqual([]);
  });
});
