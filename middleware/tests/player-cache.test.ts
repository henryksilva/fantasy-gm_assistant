import assert from "node:assert/strict";
import test from "node:test";

import { PlayerMapCache } from "../src/player-cache.js";

test("reuses the player map until the TTL expires", async () => {
  let now = 1_000;
  let calls = 0;
  const cache = new PlayerMapCache(
    async () => {
      calls += 1;
      return { [String(calls)]: { player_id: String(calls) } };
    },
    100,
    () => now,
  );

  const first = await cache.get();
  const second = await cache.get();
  assert.equal(calls, 1);
  assert.equal(first, second);

  now += 101;
  await cache.get();
  assert.equal(calls, 2);
});

test("coalesces simultaneous cache misses", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const cache = new PlayerMapCache(async () => {
    calls += 1;
    await gate;
    return {};
  });

  const first = cache.get();
  const second = cache.get();
  release();
  await Promise.all([first, second]);

  assert.equal(calls, 1);
});
