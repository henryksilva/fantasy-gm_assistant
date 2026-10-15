import assert from "node:assert/strict";
import test from "node:test";

import { resolvePlayers } from "../src/player-resolver.js";

test("returns only requested players and reports missing IDs", () => {
  const result = resolvePlayers(["11604", "missing"], {
    "11604": {
      player_id: "11604",
      full_name: "Example Player",
      first_name: "Example",
      last_name: "Player",
      position: "WR",
      fantasy_positions: ["WR"],
      team: "NE",
      active: true,
      status: "Active",
      injury_status: null,
      age: 25,
      years_exp: 3,
      ignored_large_field: "not returned",
    },
    unrequested: { player_id: "unrequested", full_name: "Not Returned" },
  });

  assert.deepEqual(result, {
    players: [
      {
        player_id: "11604",
        full_name: "Example Player",
        first_name: "Example",
        last_name: "Player",
        position: "WR",
        fantasy_positions: ["WR"],
        team: "NE",
        active: true,
        status: "Active",
        injury_status: null,
        age: 25,
        years_exp: 3,
      },
    ],
    not_found: ["missing"],
  });
});

test("derives full_name when Sleeper omits it", () => {
  const result = resolvePlayers(["1"], {
    "1": { first_name: "Jane", last_name: "Doe" },
  });
  assert.equal(result.players[0]?.full_name, "Jane Doe");
});
