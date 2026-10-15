import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  createSleeperMcpServer,
  handleMcpRequest,
  type McpDependencies,
} from "../src/mcp-server.js";

const dependencies: McpDependencies = {
  sleeper: {
    async get(path: string) {
      if (path === "/state/nfl") {
        return { season: "2026", week: 6, league_season: "2026", extra: "drop" };
      }
      if (path === "/user/HenrykManente") {
        return {
          user_id: "1050514781800734720",
          username: "HenrykManente",
          display_name: "HenrykManente",
          extra: "drop",
        };
      }
      if (path.includes("/leagues/nfl/")) {
        return [
          {
            league_id: "1389353930927927296",
            name: "Dynasty Apoiadores 10 Jardas",
            sport: "nfl",
            season: "2026",
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/rosters")) {
        return [
          {
            roster_id: 6,
            league_id: "1389353930927927296",
            owner_id: "1050514781800734720",
            players: ["11604"],
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/users")) {
        return [
          {
            user_id: "1050514781800734720",
            username: "HenrykManente",
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/matchups/6")) {
        return [
          {
            matchup_id: 1,
            roster_id: 6,
            points: 123.4,
            players: ["11604"],
            starters: ["11604"],
            players_points: { "11604": 20.5 },
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/transactions/6")) {
        return [
          {
            transaction_id: "tx-1",
            type: "trade",
            status: "complete",
            roster_ids: [6, 7],
            adds: { "20000": 6 },
            drops: { "11604": 6 },
            draft_picks: [],
            waiver_budget: [],
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/traded_picks")) {
        return [
          {
            season: "2027",
            round: 1,
            roster_id: 6,
            previous_owner_id: 6,
            owner_id: 7,
            extra: "drop",
          },
        ];
      }
      if (path.endsWith("/drafts")) {
        return [
          {
            draft_id: "1389353930936287232",
            league_id: "1389353930927927296",
            sport: "nfl",
            season: "2026",
            status: "complete",
            type: "linear",
            extra: "drop",
          },
        ];
      }
      if (path === "/draft/1389353930936287232/picks") {
        return [
          {
            draft_id: "1389353930936287232",
            player_id: "20000",
            picked_by: "1050514781800734720",
            roster_id: 6,
            round: 1,
            draft_slot: 6,
            pick_no: 6,
            extra: "drop",
          },
        ];
      }
      if (path === "/draft/1389353930936287232") {
        return {
          draft_id: "1389353930936287232",
          league_id: "1389353930927927296",
          sport: "nfl",
          season: "2026",
          status: "complete",
          type: "linear",
          extra: "drop",
        };
      }
      if (path.endsWith("/winners_bracket")) {
        return [{ r: 1, m: 1, t1: 6, t2: 7, w: 6, l: 7, extra: "drop" }];
      }
      if (
        path ===
        "/players/nfl/trending/add?lookback_hours=24&limit=25"
      ) {
        return [{ player_id: "30000", count: 42, extra: "drop" }];
      }
      if (path === "/league/1389353930927927296") {
        return {
          league_id: "1389353930927927296",
          name: "Dynasty Apoiadores 10 Jardas",
          sport: "nfl",
          season: "2026",
          extra: "drop",
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    },
  },
  playerMapProvider: {
    async get() {
      return {
        "11604": {
          player_id: "11604",
          full_name: "Example Player",
          position: "WR",
          fantasy_positions: ["WR"],
          active: true,
        },
        "20000": {
          player_id: "20000",
          full_name: "Available Receiver",
          position: "WR",
          fantasy_positions: ["WR"],
          active: true,
          search_rank: 10,
        },
        "30000": {
          player_id: "30000",
          full_name: "Trending Receiver",
          position: "WR",
          fantasy_positions: ["WR"],
          active: true,
          search_rank: 20,
        },
      };
    },
  },
};

async function connectedClient() {
  const server = createSleeperMcpServer(dependencies);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

test("advertises exactly the sixteen read-only tools", async () => {
  const { client, server } = await connectedClient();
  try {
    const response = await client.listTools();
    assert.deepEqual(
      response.tools.map((tool) => tool.name),
      [
        "get_nfl_state",
        "get_sleeper_user",
        "list_user_nfl_leagues",
        "get_league_details",
        "list_league_rosters",
        "list_league_members",
        "list_league_matchups",
        "list_league_transactions",
        "list_league_traded_picks",
        "list_league_drafts",
        "get_draft_details",
        "list_draft_picks",
        "get_league_playoff_bracket",
        "list_trending_players",
        "list_available_players",
        "resolve_sleeper_players",
      ],
    );
    for (const tool of response.tools) {
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
    }
  } finally {
    await client.close();
    await server.close();
  }
});

test("calls expanded league, draft, trend, and availability tools", async () => {
  const { client, server } = await connectedClient();
  try {
    const league_id = "1389353930927927296";
    const draft_id = "1389353930936287232";

    const matchups = await client.callTool({
      name: "list_league_matchups",
      arguments: { league_id, week: 6 },
    });
    assert.equal(
      ((matchups.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const transactions = await client.callTool({
      name: "list_league_transactions",
      arguments: { league_id, week: 6 },
    });
    assert.equal(
      ((transactions.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const tradedPicks = await client.callTool({
      name: "list_league_traded_picks",
      arguments: { league_id },
    });
    assert.equal(
      ((tradedPicks.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const drafts = await client.callTool({
      name: "list_league_drafts",
      arguments: { league_id },
    });
    assert.equal(((drafts.structuredContent as { data: unknown[] }).data).length, 1);

    const draft = await client.callTool({
      name: "get_draft_details",
      arguments: { draft_id },
    });
    assert.equal(
      ((draft.structuredContent as { data: { draft_id: string } }).data).draft_id,
      draft_id,
    );

    const draftPicks = await client.callTool({
      name: "list_draft_picks",
      arguments: { draft_id },
    });
    assert.equal(
      ((draftPicks.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const bracket = await client.callTool({
      name: "get_league_playoff_bracket",
      arguments: { league_id, bracket: "winners" },
    });
    assert.equal(((bracket.structuredContent as { data: unknown[] }).data).length, 1);

    const trending = await client.callTool({
      name: "list_trending_players",
      arguments: { trend_type: "add", lookback_hours: 24, limit: 25 },
    });
    const trendingData = trending.structuredContent as {
      data: Array<{ player_id: string }>;
      not_found: string[];
    };
    assert.deepEqual(trendingData.data.map((entry) => entry.player_id), ["30000"]);
    assert.deepEqual(trendingData.not_found, []);

    const available = await client.callTool({
      name: "list_available_players",
      arguments: { league_id, position: "WR", limit: 10 },
    });
    assert.deepEqual(
      (
        (available.structuredContent as {
          data: Array<{ player_id: string }>;
        }).data
      ).map((player) => player.player_id),
      ["20000", "30000"],
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("calls Sleeper tools and returns compact structured data", async () => {
  const { client, server } = await connectedClient();
  try {
    const state = await client.callTool({ name: "get_nfl_state", arguments: {} });
    assert.deepEqual(state.structuredContent, {
      data: { season: "2026", week: 6, league_season: "2026" },
    });

    const user = await client.callTool({
      name: "get_sleeper_user",
      arguments: { user_identifier: "HenrykManente" },
    });
    assert.deepEqual(user.structuredContent, {
      data: {
        user_id: "1050514781800734720",
        username: "HenrykManente",
        display_name: "HenrykManente",
      },
    });

    const leagues = await client.callTool({
      name: "list_user_nfl_leagues",
      arguments: { user_id: "1050514781800734720", season: "2026" },
    });
    assert.equal(
      ((leagues.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const league = await client.callTool({
      name: "get_league_details",
      arguments: { league_id: "1389353930927927296" },
    });
    assert.equal(
      ((league.structuredContent as { data: { name: string } }).data).name,
      "Dynasty Apoiadores 10 Jardas",
    );

    const rosters = await client.callTool({
      name: "list_league_rosters",
      arguments: { league_id: "1389353930927927296" },
    });
    assert.equal(
      ((rosters.structuredContent as { data: unknown[] }).data).length,
      1,
    );

    const members = await client.callTool({
      name: "list_league_members",
      arguments: { league_id: "1389353930927927296" },
    });
    assert.equal(
      ((members.structuredContent as { data: unknown[] }).data).length,
      1,
    );
  } finally {
    await client.close();
    await server.close();
  }
});

test("resolves players, removes duplicates, and reports missing IDs", async () => {
  const { client, server } = await connectedClient();
  try {
    const response = await client.callTool({
      name: "resolve_sleeper_players",
      arguments: { player_ids: ["11604", "missing", "11604"] },
    });
    const result = response.structuredContent as {
      players: Array<{ player_id: string }>;
      not_found: string[];
    };
    assert.deepEqual(result.players.map((player) => player.player_id), ["11604"]);
    assert.deepEqual(result.not_found, ["missing"]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("rejects invalid tool arguments through the MCP schema", async () => {
  const { client, server } = await connectedClient();
  try {
    const response = await client.callTool({
      name: "get_league_details",
      arguments: { league_id: "not-numeric" },
    });
    assert.equal(response.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test("answers the MCP initialize request over streamable HTTP", async () => {
  const response = await handleMcpRequest(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "http-test", version: "1.0.0" },
        },
      }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  const body = (await response.json()) as {
    result: { serverInfo: { name: string } };
  };
  assert.equal(body.result.serverInfo.name, "fantasy-assist-gm-sleeper");
});
