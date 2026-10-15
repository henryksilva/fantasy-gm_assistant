import assert from "node:assert/strict";
import test from "node:test";

import { handleResolvePlayers } from "../src/handler.js";
import type { PlayerMapProvider } from "../src/types.js";

const provider: PlayerMapProvider = {
  async get() {
    return {
      "11604": {
        player_id: "11604",
        full_name: "Example Player",
        position: "WR",
        fantasy_positions: ["WR"],
        active: true,
      },
    };
  },
};

function request(body: unknown): Request {
  return new Request("http://localhost/players/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("returns a compact successful response", async () => {
  const response = await handleResolvePlayers(
    request({ player_ids: ["11604", "missing", "11604"] }),
    provider,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    players: Array<{ player_id: string }>;
    not_found: string[];
  };
  assert.deepEqual(body.players.map((player) => player.player_id), ["11604"]);
  assert.deepEqual(body.not_found, ["missing"]);
});

test("returns 400 for an invalid request", async () => {
  const response = await handleResolvePlayers(request({}), provider);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "player_ids is required." });
});

test("returns 502 when Sleeper data cannot be loaded", async () => {
  const failingProvider: PlayerMapProvider = {
    async get() {
      throw new Error("upstream unavailable");
    },
  };
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const response = await handleResolvePlayers(
      request({ player_ids: ["11604"] }),
      failingProvider,
    );
    assert.equal(response.status, 502);
  } finally {
    console.error = originalError;
  }
});
