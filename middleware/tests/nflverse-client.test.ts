import assert from "node:assert/strict";
import test from "node:test";

import {
  NflverseSeasonCache,
  parseCsv,
  parsePlayerStatsCsv,
  parseSnapCountsCsv,
} from "../src/nflverse-client.js";

test("parses quoted CSV fields and weekly player stats", () => {
  assert.deepEqual(parseCsv('name,note\n"Doe, Jane","a ""quote"""\n'), [
    ["name", "note"],
    ["Doe, Jane", 'a "quote"'],
  ]);

  const rows = parsePlayerStatsCsv(
    "player_id,player_display_name,position,season,week,season_type,game_id,team,opponent_team,receptions,targets,receiving_yards,receiving_tds\n" +
      "00-test,Example Player,WR,2026,6,REG,2026_06_TST_EXM,TST,EXM,5,7,80,1\n",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source_player_id, "00-test");
  assert.deepEqual(rows[0]?.metrics, {
    receptions: 5,
    targets: 7,
    receiving_yards: 80,
    receiving_tds: 1,
  });
});

test("parses snap counts with nullable percentages", () => {
  const rows = parseSnapCountsCsv(
    "season,week,player,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct\n" +
      "2026,6,Example Player,WR,TST,EXM,48,0.75,0,0,2,0.1\n",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.offense_snaps, 48);
  assert.equal(rows[0]?.offense_pct, 0.75);
  assert.equal(rows[0]?.special_teams_snaps, 2);
});

test("caches one in-flight nflverse season load", async () => {
  let loads = 0;
  let now = 1_000;
  const cache = new NflverseSeasonCache(
    async () => {
      loads += 1;
      return { stats: [], snaps: [] };
    },
    100,
    () => now,
  );

  const [first, second] = await Promise.all([cache.get("2026"), cache.get("2026")]);
  assert.equal(first, second);
  assert.equal(loads, 1);
  await cache.get("2026");
  assert.equal(loads, 1);
  now = 1_101;
  await cache.get("2026");
  assert.equal(loads, 2);
});
