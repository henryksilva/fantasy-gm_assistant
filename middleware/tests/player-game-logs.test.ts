import assert from "node:assert/strict";
import test from "node:test";

import { buildPlayerGameLogs, scorePlayer } from "../src/player-game-logs.js";

test("calculates offensive and IDP points from league settings", () => {
  assert.equal(
    scorePlayer(
      { receptions: 5, receiving_yards: 80, receiving_tds: 1 },
      { rec: 0.2, rec_yd: 0.1, rec_td: 6 },
      "WR",
    ),
    15,
  );
  assert.equal(
    scorePlayer(
      {
        def_tackles_solo: 3,
        def_tackle_assists: 2,
        def_tackles_for_loss: 1,
        def_sacks: 1,
        def_qb_hits: 1,
      },
      {
        idp_tkl_solo: 1,
        idp_tkl_ast: 0.5,
        idp_tkl_loss: 2,
        idp_sack: 4,
        idp_qb_hit: 1,
      },
      "DL",
    ),
    11,
  );
});

test("maps Sleeper DB to nflverse SAF and reports unsupported scoring", () => {
  const result = buildPlayerGameLogs({
    playerIds: ["12567"],
    playerMap: {
      "12567": {
        player_id: "12567",
        full_name: "Malaki Starks",
        position: "DB",
        team: "BAL",
      },
    },
    season: "2026",
    throughWeek: 1,
    gameLogLimit: 5,
    scoringSettings: { idp_tkl_solo: 1, st_tkl_solo: 0.5 },
    rosteredPlayerIds: new Set(),
    seasonData: {
      stats: [
        {
          source_player_id: "00-0040688",
          player_name: "Malaki Starks",
          position: "SAF",
          season: "2026",
          week: 1,
          season_type: "REG",
          game_id: "2026_01_BAL_IND",
          team: "BAL",
          opponent_team: "IND",
          metrics: { def_tackles_solo: 2 },
        },
      ],
      snaps: [],
    },
  });

  assert.equal(result.data[0]?.source_player_id, "00-0040688");
  assert.equal(result.data[0]?.game_logs[0]?.fantasy_points, 2);
  assert.deepEqual(result.unsupported_scoring_keys, ["st_tkl_solo"]);
  assert.deepEqual(result.unresolved, []);
});

test("identifies a bye from the team schedule instead of missing player stats", () => {
  const result = buildPlayerGameLogs({
    playerIds: ["12567"],
    playerMap: {
      "12567": {
        player_id: "12567",
        full_name: "Malaki Starks",
        position: "DB",
        team: "BAL",
      },
    },
    season: "2026",
    throughWeek: 2,
    gameLogLimit: 5,
    scoringSettings: { idp_tkl_solo: 1 },
    rosteredPlayerIds: new Set(),
    seasonData: {
      stats: [
        {
          source_player_id: "00-0040688",
          player_name: "Malaki Starks",
          position: "SAF",
          season: "2026",
          week: 1,
          season_type: "REG",
          game_id: "2026_01_BAL_CLE",
          team: "BAL",
          opponent_team: "CLE",
          metrics: { def_tackles_solo: 2 },
        },
      ],
      snaps: [],
      schedules: [
        {
          game_id: "2026_01_BAL_CLE",
          season: "2026",
          game_type: "REG",
          week: 1,
          away_team: "BAL",
          home_team: "CLE",
        },
        {
          game_id: "2026_02_PIT_CLE",
          season: "2026",
          game_type: "REG",
          week: 2,
          away_team: "PIT",
          home_team: "CLE",
        },
      ],
    },
  });

  assert.deepEqual(result.data[0]?.week_context, {
    week: 2,
    team: "BAL",
    opponent: null,
    status: "bye",
  });
  assert.deepEqual(result.data[0]?.bye_weeks, [2]);
  assert.match(result.source.schedule_url, /schedules\/games\.csv$/);
});
