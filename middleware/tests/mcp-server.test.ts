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

test("advertises exactly the seven read-only MVP tools", async () => {
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
