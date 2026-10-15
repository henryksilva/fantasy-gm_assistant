import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";

import { playerMapCache } from "./player-cache.js";
import { resolvePlayers } from "./player-resolver.js";
import {
  compactLeague,
  compactLeagues,
  compactMembers,
  compactNflState,
  compactRosters,
  compactUser,
  sleeperClient,
  type SleeperClient,
} from "./sleeper-client.js";
import type { PlayerMapProvider } from "./types.js";
import { validatePlayerIds } from "./validation.js";

const numericId = z
  .string()
  .regex(/^\d+$/, "Must contain only digits.")
  .max(32);
const season = z.string().regex(/^\d{4}$/, "Use a four-digit season.");
const userIdentifier = z.string().trim().min(1).max(64);
const flexibleObject = z.record(z.string(), z.unknown());

const nflStateSchema = z.object({
  season: z.string().optional(),
  week: z.number().optional(),
  league_season: z.string().optional(),
  season_type: z.string().nullable().optional(),
  leg: z.number().nullable().optional(),
  display_week: z.number().nullable().optional(),
  previous_season: z.string().nullable().optional(),
  season_start_date: z.string().nullable().optional(),
  league_create_season: z.string().nullable().optional(),
});

const userSchema = z.object({
  user_id: z.string().optional(),
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
});

const leagueSchema = z.object({
  league_id: z.string().optional(),
  name: z.string().optional(),
  sport: z.string().optional(),
  season: z.string().optional(),
  season_type: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  total_rosters: z.number().nullable().optional(),
  avatar: z.string().nullable().optional(),
  draft_id: z.string().nullable().optional(),
  previous_league_id: z.string().nullable().optional(),
  roster_positions: z.array(z.string()).nullable().optional(),
  settings: flexibleObject.nullable().optional(),
  scoring_settings: flexibleObject.nullable().optional(),
});

const rosterSchema = z.object({
  roster_id: z.number().optional(),
  league_id: z.string().optional(),
  owner_id: z.string().nullable().optional(),
  co_owners: z.array(z.string()).nullable().optional(),
  players: z.array(z.string()).nullable().optional(),
  starters: z.array(z.string()).nullable().optional(),
  reserve: z.array(z.string()).nullable().optional(),
  taxi: z.array(z.string()).nullable().optional(),
  settings: flexibleObject.nullable().optional(),
  metadata: flexibleObject.nullable().optional(),
});

const memberSchema = z.object({
  user_id: z.string().optional(),
  username: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  is_owner: z.boolean().nullable().optional(),
  metadata: flexibleObject.nullable().optional(),
});

const compactPlayerSchema = z.object({
  player_id: z.string(),
  full_name: z.string().nullable(),
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  position: z.string().nullable(),
  fantasy_positions: z.array(z.string()),
  team: z.string().nullable(),
  active: z.boolean().nullable(),
  status: z.string().nullable(),
  injury_status: z.string().nullable(),
  age: z.number().nullable(),
  years_exp: z.number().nullable(),
});

export interface McpDependencies {
  sleeper: SleeperClient;
  playerMapProvider: PlayerMapProvider;
}

const defaultDependencies: McpDependencies = {
  sleeper: sleeperClient,
  playerMapProvider: playerMapCache,
};

function result(data: unknown, message: string) {
  return {
    structuredContent: { data },
    content: [{ type: "text" as const, text: message }],
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error.";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createSleeperMcpServer(
  dependencies: McpDependencies = defaultDependencies,
): McpServer {
  const server = new McpServer(
    { name: "fantasy-assist-gm-sleeper", version: "1.0.0" },
    {
      instructions:
        "Read-only Sleeper NFL tools. Discover the current season with get_nfl_state, resolve usernames with get_sleeper_user, then use stable IDs. Resolve roster player IDs with resolve_sleeper_players. Do not infer player identities or unsupported trade values.",
      maxToolInputElements: 120,
    },
  );

  server.registerTool(
    "get_nfl_state",
    {
      title: "Get current NFL state",
      description:
        "Get Sleeper's current NFL season, league season, and week. Use this before listing leagues when the season is unknown.",
      outputSchema: { data: nflStateSchema.nullable() },
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        const data = compactNflState(await dependencies.sleeper.get("/state/nfl"));
        return result(data, data ? "Current NFL state found." : "Sleeper returned no NFL state.");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_sleeper_user",
    {
      title: "Find a Sleeper user",
      description:
        "Find a Sleeper account by username or user ID. Use the returned stable user_id for league queries.",
      inputSchema: {
        user_identifier: userIdentifier.describe("Sleeper username or numeric user_id."),
      },
      outputSchema: { data: userSchema.nullable() },
      annotations: readOnlyAnnotations,
    },
    async ({ user_identifier }) => {
      try {
        const data = compactUser(
          await dependencies.sleeper.get(`/user/${encodeURIComponent(user_identifier)}`),
        );
        return result(data, data ? "Sleeper user found." : "Sleeper user not found.");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_user_nfl_leagues",
    {
      title: "List a user's NFL leagues",
      description:
        "List NFL leagues for a stable Sleeper user_id and four-digit season. Resolve usernames first.",
      inputSchema: {
        user_id: numericId.describe("Stable numeric Sleeper user_id."),
        season: season.describe("Four-digit NFL season, such as 2026."),
      },
      outputSchema: { data: z.array(leagueSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ user_id, season: requestedSeason }) => {
      try {
        const data = compactLeagues(
          await dependencies.sleeper.get(
            `/user/${encodeURIComponent(user_id)}/leagues/nfl/${encodeURIComponent(requestedSeason)}`,
          ),
        );
        return result(data, `Found ${data.length} NFL league(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_league_details",
    {
      title: "Get Sleeper league details",
      description:
        "Get the configuration and identifiers for one Sleeper league before analyzing its rosters.",
      inputSchema: { league_id: numericId.describe("Numeric Sleeper league_id.") },
      outputSchema: { data: leagueSchema.nullable() },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id }) => {
      try {
        const data = compactLeague(
          await dependencies.sleeper.get(`/league/${encodeURIComponent(league_id)}`),
        );
        return result(data, data ? "League details found." : "League not found.");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_league_rosters",
    {
      title: "List league rosters",
      description:
        "List all rosters and their player IDs for a Sleeper league. Match owner_id with league members.",
      inputSchema: { league_id: numericId.describe("Numeric Sleeper league_id.") },
      outputSchema: { data: z.array(rosterSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id }) => {
      try {
        const data = compactRosters(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/rosters`,
          ),
        );
        return result(data, `Found ${data.length} roster(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_league_members",
    {
      title: "List league members",
      description:
        "List Sleeper users in a league. Join user_id to roster owner_id to identify each manager.",
      inputSchema: { league_id: numericId.describe("Numeric Sleeper league_id.") },
      outputSchema: { data: z.array(memberSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id }) => {
      try {
        const data = compactMembers(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/users`,
          ),
        );
        return result(data, `Found ${data.length} league member(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "resolve_sleeper_players",
    {
      title: "Resolve Sleeper player IDs",
      description:
        "Resolve up to 100 Sleeper player_ids into compact names, positions, team, activity, injury, age, and experience data. Use this after reading a roster; never guess identities.",
      inputSchema: {
        player_ids: z
          .array(z.string().trim().min(1).max(64))
          .max(100)
          .describe("Sleeper player IDs from one or more rosters."),
      },
      outputSchema: {
        players: z.array(compactPlayerSchema),
        not_found: z.array(z.string()),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ player_ids }) => {
      const validation = validatePlayerIds({ player_ids });
      if (!validation.ok) {
        return toolError(new Error(validation.error));
      }

      try {
        const resolved = resolvePlayers(
          validation.playerIds,
          await dependencies.playerMapProvider.get(),
        );
        return {
          structuredContent: {
            players: resolved.players,
            not_found: resolved.not_found,
          },
          content: [
            {
              type: "text" as const,
              text: `Resolved ${resolved.players.length} player(s); ${resolved.not_found.length} not found.`,
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: mcpCorsHeaders(),
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  const server = createSleeperMcpServer();

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return withCors(response);
  } catch (error) {
    console.error("MCP request failed", error);
    return withCors(
      Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal MCP server error." },
          id: null,
        },
        { status: 500 },
      ),
    );
  }
}

function mcpCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, MCP-Session-Id",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(mcpCorsHeaders())) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
