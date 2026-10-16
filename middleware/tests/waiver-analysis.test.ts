import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerGameLogSummary } from "../src/player-game-logs.js";
import {
  rankWaiverPlayers,
  selectAvailablePlayerIds,
  selectRosterComparisonIds,
} from "../src/waiver-analysis.js";

const playerMap = {
  starter: {
    full_name: "Protected Starter",
    position: "WR",
    fantasy_positions: ["WR"],
    active: true,
    search_rank: 1,
  },
  bench: {
    full_name: "Bench Player",
    position: "WR",
    fantasy_positions: ["WR"],
    active: true,
    search_rank: 100,
  },
  taxi: {
    full_name: "Taxi Player",
    position: "WR",
    fantasy_positions: ["WR"],
    active: true,
    search_rank: 200,
  },
  free1: {
    full_name: "Top Free Agent",
    position: "WR",
    fantasy_positions: ["WR"],
    active: true,
    search_rank: 10,
  },
  free2: {
    full_name: "Inactive Free Agent",
    position: "WR",
    fantasy_positions: ["WR"],
    active: false,
    search_rank: 2,
  },
};

test("selects active free agents and protects starters, reserve, and taxi", () => {
  assert.deepEqual(
    selectAvailablePlayerIds({
      playerMap,
      rosteredPlayerIds: new Set(["starter", "bench", "taxi"]),
      positions: ["WR"],
      limit: 10,
    }),
    ["free1"],
  );

  assert.deepEqual(
    selectRosterComparisonIds({
      playerMap,
      players: ["starter", "bench", "taxi"],
      starters: ["starter"],
      reserve: [],
      taxi: ["taxi"],
      positions: ["WR"],
      limit: 10,
    }),
    ["bench"],
  );
});

test("ranks stronger recent production and usage above a weak comparison", () => {
  const summaries: PlayerGameLogSummary[] = [
    summary("free1", "Top Free Agent", 14, 18, 16, 0.82, 10),
    summary("bench", "Bench Player", 5, 4, 5, 0.25, 2),
  ];
  const ranked = rankWaiverPlayers(summaries);
  assert.deepEqual(ranked.map((entry) => entry.player_id), ["free1", "bench"]);
  assert.ok(ranked[0]!.waiver_score > ranked[1]!.waiver_score);
  assert.equal(ranked[0]!.recent_snap_pct, 82);
});

function summary(
  playerId: string,
  fullName: string,
  season: number,
  last3: number,
  last5: number,
  snapPct: number,
  opportunities: number,
): PlayerGameLogSummary {
  return {
    player_id: playerId,
    full_name: fullName,
    position: "WR",
    team: "TST",
    currently_available: playerId === "free1",
    mapping_method: "exact_name_position",
    source_player_id: playerId,
    games_played: 6,
    averages: { season, last_3: last3, last_5: last5 },
    game_logs: [1, 2, 3].map((week) => ({
      week,
      game_id: `game-${week}`,
      team: "TST",
      opponent: "OPP",
      fantasy_points: last3,
      carries: 0,
      targets: opportunities,
      receptions: 5,
      passing_yards: 0,
      rushing_yards: 0,
      receiving_yards: 50,
      total_touches: 5,
      tackles_solo: 0,
      tackles_assists: 0,
      tackles_for_loss: 0,
      sacks: 0,
      qb_hits: 0,
      interceptions: 0,
      passes_defended: 0,
      forced_fumbles: 0,
      fumble_recoveries: 0,
      offense_snaps: 50,
      offense_snap_pct: snapPct,
      defense_snaps: 0,
      defense_snap_pct: 0,
      special_teams_snaps: 0,
      special_teams_snap_pct: 0,
    })),
  };
}
