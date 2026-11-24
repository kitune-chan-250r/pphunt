/**
 * Regression tests for the BeatSaver Pages Function proxy.
 *
 * The Cloudflare Pages route for this function is `/api/beatsaver/*`, so the
 * catch-all `params.path` contains only the remainder after that prefix
 * (e.g. `/api/beatsaver/maps/hash/X` -> ["maps", "hash", "X"]). The handler
 * previously validated `params.path` as if it were the full request path
 * (["api", "beatsaver", ...]) and therefore returned 404 for every real
 * request in production. These tests pin the remainder-based behaviour.
 *
 * Run with: npm run test:functions   (Node's built-in test runner)
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { onRequestGet } from "../../functions/api/beatsaver/[[path]].ts";

const HASH = "a5f92c36d79b3a9e4b1d0e8f7a6b5c4d3e2f1a09";

const realFetch = globalThis.fetch;
let fetchCalls: string[];
let upstreamStatus: number;
let upstreamBody: string;

beforeEach(() => {
  fetchCalls = [];
  upstreamStatus = 200;
  upstreamBody = JSON.stringify({ id: "abc123" });
  globalThis.fetch = (input: RequestInfo | URL) => {
    fetchCalls.push(String(input));
    return Promise.resolve(
      new Response(upstreamBody, {
        status: upstreamStatus,
        headers: { "content-type": "application/json" },
      }),
    );
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const call = (path: string[], search = "") =>
  onRequestGet({
    request: new Request(
      `https://pphunt.rakas.cc/api/beatsaver/${path.join("/")}${search}`,
    ),
    params: { path },
  });

describe("BeatSaver proxy handler (remainder path)", () => {
  it("forwards the app-shaped remainder path to BeatSaver", async () => {
    const res = await call(["maps", "hash", HASH]);
    assert.equal(res.status, 200);
    assert.deepEqual(fetchCalls, [
      `https://api.beatsaver.com/maps/hash/${HASH}`,
    ]);
    assert.equal(await res.text(), upstreamBody);
    assert.equal(res.headers.get("content-type"), "application/json");
  });

  it("forwards the query string to the upstream", async () => {
    await call(["maps", "hash", HASH], "?foo=bar");
    assert.deepEqual(fetchCalls, [
      `https://api.beatsaver.com/maps/hash/${HASH}?foo=bar`,
    ]);
  });

  it("passes through the upstream status code", async () => {
    upstreamStatus = 404;
    upstreamBody = "Not Found";
    const res = await call(["maps", "hash", HASH]);
    assert.equal(res.status, 404);
    assert.equal(fetchCalls.length, 1);
  });

  it("returns 404 without calling upstream for an empty path", async () => {
    const res = await call([]);
    assert.equal(res.status, 404);
    assert.deepEqual(fetchCalls, []);
  });

  it("rejects paths containing dot segments", async () => {
    for (const path of [["..", "x"], ["maps", ".", "hash", HASH]]) {
      const res = await call(path);
      assert.equal(res.status, 404);
    }
    assert.deepEqual(fetchCalls, []);
  });

  it("URI-encodes each segment when forwarding", async () => {
    await call(["maps", "id", "a b"]);
    assert.deepEqual(fetchCalls, ["https://api.beatsaver.com/maps/id/a%20b"]);
  });
});
