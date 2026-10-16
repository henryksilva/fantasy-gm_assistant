import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";

import { playerMapCache } from "./player-cache.js";
import {
  nflverseSeasonCache,
  type NflverseSeasonProvider,
} from "./nflverse-client.js";
import { buildPlayerGameLogs } from "./player-game-logs.js";
import { resolvePlayers } from "./player-resolver.js";
import {
  compactDraft,
  compactDraftPicks,
  compactDrafts,
  compactLeague,
  compactLeagues,
  compactMatchups,
  compactMembers,
  compactNflState,
  compactPlayoffBracket,
  compactRosters,
  compactTradedPicks,
  compactTransactions,
  compactTrending,
  compactUser,
  sleeperClient,
  type SleeperClient,
} from "./sleeper-client.js";
import type { PlayerMapProvider, SleeperPlayer } from "./types.js";
import { validatePlayerIds } from "./validation.js";

const numericId = z
  .string()
  .regex(/^\d+$/, "Must contain only digits.")
  .max(32);
const season = z.string().regex(/^\d{4}$/, "Use a four-digit season.");
const week = z.number().int().min(1).max(18);
const userIdentifier = z.string().trim().min(1).max(64);
const flexibleObject = z.record(z.string(), z.unknown());
const rosterReference = z.union([z.number(), z.string()]);

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

const matchupSchema = z.object({
  matchup_id: z.number().nullable().optional(),
  roster_id: z.number().optional(),
  points: z.number().nullable().optional(),
  custom_points: z.number().nullable().optional(),
  players: z.array(z.string()).nullable().optional(),
  starters: z.array(z.string()).nullable().optional(),
  players_points: z.record(z.string(), z.number()).nullable().optional(),
});

const tradedPickSchema = z.object({
  season: z.string().optional(),
  round: z.number().optional(),
  roster_id: rosterReference.optional(),
  previous_owner_id: rosterReference.optional(),
  owner_id: rosterReference.optional(),
});

const waiverBudgetSchema = z.object({
  sender: rosterReference.optional(),
  receiver: rosterReference.optional(),
  amount: z.number().optional(),
});

const transactionSchema = z.object({
  transaction_id: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  roster_ids: z.array(rosterReference).nullable().optional(),
  leg: z.number().nullable().optional(),
  created: z.number().nullable().optional(),
  status_updated: z.number().nullable().optional(),
  creator: z.string().nullable().optional(),
  consenter_ids: z.array(rosterReference).nullable().optional(),
  adds: z.record(z.string(), rosterReference).nullable().optional(),
  drops: z.record(z.string(), rosterReference).nullable().optional(),
  draft_picks: z.array(tradedPickSchema).nullable().optional(),
  waiver_budget: z.array(waiverBudgetSchema).nullable().optional(),
  settings: flexibleObject.nullable().optional(),
  metadata: flexibleObject.nullable().optional(),
});

const draftSchema = z.object({
  draft_id: z.string().optional(),
  league_id: z.string().nullable().optional(),
  sport: z.string().optional(),
  season: z.string().optional(),
  season_type: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  start_time: z.number().nullable().optional(),
  created: z.number().nullable().optional(),
  last_picked: z.number().nullable().optional(),
  last_message_time: z.number().nullable().optional(),
  last_message_id: z.string().nullable().optional(),
  creators: z.array(z.string()).nullable().optional(),
  draft_order: z.record(z.string(), z.number()).nullable().optional(),
  slot_to_roster_id: z.record(z.string(), rosterReference).nullable().optional(),
  settings: flexibleObject.nullable().optional(),
  metadata: flexibleObject.nullable().optional(),
});

const draftPickSchema = z.object({
  draft_id: z.string().optional(),
  player_id: z.string().nullable().optional(),
  picked_by: z.string().nullable().optional(),
  roster_id: rosterReference.nullable().optional(),
  round: z.number().optional(),
  draft_slot: z.number().optional(),
  pick_no: z.number().optional(),
  is_keeper: z.boolean().nullable().optional(),
});

const playoffSourceSchema = z.object({
  w: z.number().optional(),
  l: z.number().optional(),
});
const playoffParticipantSchema = z
  .union([z.number(), playoffSourceSchema])
  .nullable();
const playoffMatchupSchema = z.object({
  r: z.number().optional(),
  m: z.number().optional(),
  t1: playoffParticipantSchema.optional(),
  t2: playoffParticipantSchema.optional(),
  t1_from: playoffSourceSchema.nullable().optional(),
  t2_from: playoffSourceSchema.nullable().optional(),
  w: z.number().nullable().optional(),
  l: z.number().nullable().optional(),
  p: z.number().nullable().optional(),
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

const trendingPlayerSchema = z.object({
  player_id: z.string(),
  count: z.number(),
  player: compactPlayerSchema.nullable(),
});

const playerWeekLogSchema = z.object({
  week: z.number(),
  game_id: z.string().nullable(),
  team: z.string().nullable(),
  opponent: z.string().nullable(),
  fantasy_points: z.number(),
  carries: z.number(),
  targets: z.number(),
  receptions: z.number(),
  passing_yards: z.number(),
  rushing_yards: z.number(),
  receiving_yards: z.number(),
  total_touches: z.number(),
  tackles_solo: z.number(),
  tackles_assists: z.number(),
  tackles_for_loss: z.number(),
  sacks: z.number(),
  qb_hits: z.number(),
  interceptions: z.number(),
  passes_defended: z.number(),
  forced_fumbles: z.number(),
  fumble_recoveries: z.number(),
  offense_snaps: z.number().nullable(),
  offense_snap_pct: z.number().nullable(),
  defense_snaps: z.number().nullable(),
  defense_snap_pct: z.number().nullable(),
  special_teams_snaps: z.number().nullable(),
  special_teams_snap_pct: z.number().nullable(),
});

const playerGameLogSummarySchema = z.object({
  player_id: z.string(),
  full_name: z.string(),
  position: z.string().nullable(),
  team: z.string().nullable(),
  currently_available: z.boolean(),
  mapping_method: z.enum([
    "sleeper_gsis_id",
    "exact_name_position",
    "exact_name_position_team",
  ]),
  source_player_id: z.string().nullable(),
  games_played: z.number(),
  averages: z.object({
    season: z.number().nullable(),
    last_3: z.number().nullable(),
    last_5: z.number().nullable(),
  }),
  game_logs: z.array(playerWeekLogSchema),
});

const unresolvedPlayerSchema = z.object({
  player_id: z.string(),
  reason: z.string(),
});

export interface McpDependencies {
  sleeper: SleeperClient;
  playerMapProvider: PlayerMapProvider;
  nflverseSeasonProvider: NflverseSeasonProvider;
}

const defaultDependencies: McpDependencies = {
  sleeper: sleeperClient,
  playerMapProvider: playerMapCache,
  nflverseSeasonProvider: nflverseSeasonCache,
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

function playerSearchRank(player: SleeperPlayer): number {
  const rank = player.search_rank;
  return typeof rank === "number" && Number.isFinite(rank)
    ? rank
    : Number.MAX_SAFE_INTEGER;
}

function playerMatchesAvailabilityFilters(
  player: SleeperPlayer,
  requestedPosition: string | undefined,
  query: string | undefined,
  activeOnly: boolean,
): boolean {
  if (activeOnly && player.active !== true) {
    return false;
  }

  if (requestedPosition) {
    const primaryPosition =
      typeof player.position === "string" ? player.position.toUpperCase() : "";
    const fantasyPositions = Array.isArray(player.fantasy_positions)
      ? player.fantasy_positions.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    if (
      primaryPosition !== requestedPosition &&
      !fantasyPositions.some(
        (position) => position.toUpperCase() === requestedPosition,
      )
    ) {
      return false;
    }
  }

  if (query) {
    const fullName =
      typeof player.full_name === "string"
        ? player.full_name
        : [player.first_name, player.last_name]
            .filter((value): value is string => typeof value === "string")
            .join(" ");
    if (!fullName.toLocaleLowerCase().includes(query)) {
      return false;
    }
  }

  return true;
}

export function createSleeperMcpServer(
  dependencies: McpDependencies = defaultDependencies,
): McpServer {
  const server = new McpServer(
    { name: "fantasy-assist-gm-sleeper", version: "1.2.0" },
    {
      instructions:
        "Read-only Sleeper NFL tools with nflverse weekly player stats. Discover the current season with get_nfl_state, resolve usernames, then use stable IDs. Match roster_id across members, matchups, transactions, drafts, picks, and brackets. Resolve player IDs before requesting game logs. Waiver availability is derived from current rosters and is not a market valuation. Never infer player identities or trade values.",
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
    "list_league_matchups",
    {
      title: "List weekly league matchups",
      description:
        "List every roster's players, starters, and points for one league week. Join equal matchup_id values to identify opponents and roster_id to league rosters.",
      inputSchema: {
        league_id: numericId.describe("Numeric Sleeper league_id."),
        week: week.describe("NFL week from 1 through 18."),
      },
      outputSchema: { data: z.array(matchupSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id, week: requestedWeek }) => {
      try {
        const data = compactMatchups(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/matchups/${requestedWeek}`,
          ),
        );
        return result(data, `Found ${data.length} matchup roster result(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_league_transactions",
    {
      title: "List weekly league transactions",
      description:
        "List trades, waivers, free-agent moves, adds, drops, FAAB transfers, and draft picks recorded for one league week.",
      inputSchema: {
        league_id: numericId.describe("Numeric Sleeper league_id."),
        week: week.describe("Transaction week or round from 1 through 18."),
      },
      outputSchema: { data: z.array(transactionSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id, week: requestedWeek }) => {
      try {
        const data = compactTransactions(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/transactions/${requestedWeek}`,
          ),
        );
        return result(data, `Found ${data.length} transaction(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_league_traded_picks",
    {
      title: "List traded draft picks",
      description:
        "List current ownership of traded future draft picks in a league. Join roster_id and owner_id to league rosters.",
      inputSchema: { league_id: numericId.describe("Numeric Sleeper league_id.") },
      outputSchema: { data: z.array(tradedPickSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id }) => {
      try {
        const data = compactTradedPicks(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/traded_picks`,
          ),
        );
        return result(data, `Found ${data.length} traded pick(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_league_drafts",
    {
      title: "List league drafts",
      description:
        "List all drafts associated with a Sleeper league, including draft IDs, status, type, timing, order, and settings.",
      inputSchema: { league_id: numericId.describe("Numeric Sleeper league_id.") },
      outputSchema: { data: z.array(draftSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id }) => {
      try {
        const data = compactDrafts(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/drafts`,
          ),
        );
        return result(data, `Found ${data.length} draft(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_draft_details",
    {
      title: "Get draft details",
      description:
        "Get one Sleeper draft's settings, status, order, and roster-slot mapping before analyzing its picks.",
      inputSchema: { draft_id: numericId.describe("Numeric Sleeper draft_id.") },
      outputSchema: { data: draftSchema.nullable() },
      annotations: readOnlyAnnotations,
    },
    async ({ draft_id }) => {
      try {
        const data = compactDraft(
          await dependencies.sleeper.get(`/draft/${encodeURIComponent(draft_id)}`),
        );
        return result(data, data ? "Draft details found." : "Draft not found.");
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_draft_picks",
    {
      title: "List draft picks",
      description:
        "List every selection in one Sleeper draft with player_id, round, pick number, draft slot, and destination roster.",
      inputSchema: { draft_id: numericId.describe("Numeric Sleeper draft_id.") },
      outputSchema: { data: z.array(draftPickSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ draft_id }) => {
      try {
        const data = compactDraftPicks(
          await dependencies.sleeper.get(
            `/draft/${encodeURIComponent(draft_id)}/picks`,
          ),
        );
        return result(data, `Found ${data.length} draft pick(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_league_playoff_bracket",
    {
      title: "Get a league playoff bracket",
      description:
        "Get the winners or losers playoff bracket for a league. Bracket roster IDs can be joined to league rosters and members.",
      inputSchema: {
        league_id: numericId.describe("Numeric Sleeper league_id."),
        bracket: z
          .enum(["winners", "losers"])
          .describe("Choose the winners or losers bracket."),
      },
      outputSchema: { data: z.array(playoffMatchupSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id, bracket }) => {
      try {
        const data = compactPlayoffBracket(
          await dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/${bracket}_bracket`,
          ),
        );
        return result(data, `Found ${data.length} playoff bracket matchup(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_trending_players",
    {
      title: "List trending NFL players",
      description:
        "List players trending by Sleeper add or drop activity and resolve their player IDs to compact player data. This is activity data, not a market valuation.",
      inputSchema: {
        trend_type: z.enum(["add", "drop"]).describe("Trending adds or drops."),
        lookback_hours: z.number().int().min(1).max(168).default(24),
        limit: z.number().int().min(1).max(100).default(25),
      },
      outputSchema: {
        data: z.array(trendingPlayerSchema),
        not_found: z.array(z.string()),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ trend_type, lookback_hours, limit }) => {
      try {
        const [rawTrending, playerMap] = await Promise.all([
          dependencies.sleeper.get(
            `/players/nfl/trending/${trend_type}?lookback_hours=${lookback_hours}&limit=${limit}`,
          ),
          dependencies.playerMapProvider.get(),
        ]);
        const trending = compactTrending(rawTrending);
        const ids = trending
          .map((entry) => entry.player_id)
          .filter((value): value is string => typeof value === "string");
        const resolved = resolvePlayers(ids, playerMap);
        const playersById = new Map(
          resolved.players.map((player) => [player.player_id, player]),
        );
        const data = trending.flatMap((entry) => {
          if (
            typeof entry.player_id !== "string" ||
            typeof entry.count !== "number"
          ) {
            return [];
          }
          return [
            {
              player_id: entry.player_id,
              count: entry.count,
              player: playersById.get(entry.player_id) ?? null,
            },
          ];
        });
        return {
          structuredContent: { data, not_found: resolved.not_found },
          content: [
            {
              type: "text" as const,
              text: `Found ${data.length} trending player(s); ${resolved.not_found.length} unresolved.`,
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "list_available_players",
    {
      title: "List available league players",
      description:
        "Derive unrostered NFL players for a league by subtracting all current roster player IDs from the cached Sleeper player map. Optionally filter by position or name. Results are sorted by Sleeper search rank, not fantasy value.",
      inputSchema: {
        league_id: numericId.describe("Numeric Sleeper league_id."),
        position: z
          .string()
          .trim()
          .min(1)
          .max(16)
          .optional()
          .describe("Optional position such as QB, RB, WR, TE, K, DL, LB, or DB."),
        query: z
          .string()
          .trim()
          .min(2)
          .max(64)
          .optional()
          .describe("Optional case-insensitive player name fragment."),
        active_only: z.boolean().default(true),
        limit: z.number().int().min(1).max(100).default(50),
      },
      outputSchema: { data: z.array(compactPlayerSchema) },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id, position, query, active_only, limit }) => {
      try {
        const [rawRosters, playerMap] = await Promise.all([
          dependencies.sleeper.get(
            `/league/${encodeURIComponent(league_id)}/rosters`,
          ),
          dependencies.playerMapProvider.get(),
        ]);
        const rosteredPlayerIds = new Set<string>();
        for (const roster of compactRosters(rawRosters)) {
          if (Array.isArray(roster.players)) {
            for (const playerId of roster.players) {
              if (typeof playerId === "string") {
                rosteredPlayerIds.add(playerId);
              }
            }
          }
        }

        const requestedPosition = position?.toUpperCase();
        const normalizedQuery = query?.toLocaleLowerCase();
        const availableIds = Object.entries(playerMap)
          .filter(([playerId, player]) =>
            !rosteredPlayerIds.has(playerId) &&
            playerMatchesAvailabilityFilters(
              player,
              requestedPosition,
              normalizedQuery,
              active_only,
            ),
          )
          .sort(([, left], [, right]) => {
            const rankDifference =
              playerSearchRank(left) - playerSearchRank(right);
            if (rankDifference !== 0) {
              return rankDifference;
            }
            const leftName =
              typeof left.full_name === "string" ? left.full_name : "";
            const rightName =
              typeof right.full_name === "string" ? right.full_name : "";
            return leftName.localeCompare(rightName);
          })
          .slice(0, limit)
          .map(([playerId]) => playerId);
        const data = resolvePlayers(availableIds, playerMap).players;
        return result(data, `Found ${data.length} available player(s).`);
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_player_game_logs",
    {
      title: "Get player game logs and league scoring",
      description:
        "Get roster-independent weekly NFL game logs for up to 25 Sleeper player_ids, calculate fantasy points with the league scoring settings, and return season, last-3, and last-5 averages plus usage and snap trends. Use after list_available_players or resolve_sleeper_players. Mapping is conservative and unresolved IDs are reported instead of guessed. nflverse data can lag completed games and unsupported nonzero scoring rules are listed explicitly.",
      inputSchema: {
        league_id: numericId.describe(
          "Numeric Sleeper league_id whose scoring settings and current rosters should be used.",
        ),
        player_ids: z
          .array(z.string().trim().min(1).max(64))
          .min(1)
          .max(25)
          .describe("One to 25 Sleeper player_ids to evaluate."),
        season: season.describe("Four-digit NFL season, such as 2026."),
        through_week: week.describe(
          "Include regular-season games through this NFL week.",
        ),
        game_log_limit: z
          .number()
          .int()
          .min(1)
          .max(8)
          .default(5)
          .describe("Most recent game logs to return per player; averages still use all games through the requested week."),
      },
      outputSchema: {
        data: z.array(playerGameLogSummarySchema),
        unresolved: z.array(unresolvedPlayerSchema),
        unsupported_scoring_keys: z.array(z.string()),
        source: z.object({
          provider: z.literal("nflverse"),
          stats_url: z.string(),
          snaps_url: z.string(),
        }),
      },
      annotations: readOnlyAnnotations,
    },
    async ({ league_id, player_ids, season: requestedSeason, through_week, game_log_limit }) => {
      try {
        const [rawLeague, rawRosters, playerMap, seasonData] = await Promise.all([
          dependencies.sleeper.get(`/league/${encodeURIComponent(league_id)}`),
          dependencies.sleeper.get(`/league/${encodeURIComponent(league_id)}/rosters`),
          dependencies.playerMapProvider.get(),
          dependencies.nflverseSeasonProvider.get(requestedSeason),
        ]);
        const league = compactLeague(rawLeague);
        if (!league) throw new Error("Sleeper league not found.");
        const scoringSettings =
          typeof league.scoring_settings === "object" &&
          league.scoring_settings !== null &&
          !Array.isArray(league.scoring_settings)
            ? (league.scoring_settings as Record<string, unknown>)
            : {};
        const rosteredPlayerIds = new Set<string>();
        for (const roster of compactRosters(rawRosters)) {
          if (!Array.isArray(roster.players)) continue;
          for (const playerId of roster.players) {
            if (typeof playerId === "string") rosteredPlayerIds.add(playerId);
          }
        }

        const response = buildPlayerGameLogs({
          playerIds: player_ids,
          playerMap,
          seasonData,
          season: requestedSeason,
          throughWeek: through_week,
          gameLogLimit: game_log_limit,
          scoringSettings,
          rosteredPlayerIds,
        });
        return {
          structuredContent: response,
          content: [
            {
              type: "text" as const,
              text: `Built game logs for ${response.data.length} player(s); ${response.unresolved.length} unresolved; ${response.unsupported_scoring_keys.length} unsupported scoring rule(s).`,
            },
          ],
        };
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
