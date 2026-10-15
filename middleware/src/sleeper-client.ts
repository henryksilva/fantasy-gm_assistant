const SLEEPER_API_BASE_URL = "https://api.sleeper.app/v1";
const UPSTREAM_TIMEOUT_MS = 15_000;

export interface SleeperClient {
  get(path: string): Promise<unknown>;
}

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SleeperApiError";
  }
}

export const sleeperClient: SleeperClient = {
  async get(path: string): Promise<unknown> {
    const response = await fetch(`${SLEEPER_API_BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new SleeperApiError(
        `Sleeper API returned HTTP ${response.status}.`,
        response.status,
      );
    }

    return response.json();
  },
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is JsonRecord => item !== null)
    : [];
}

function pick(source: JsonRecord, keys: readonly string[]): JsonRecord {
  return Object.fromEntries(
    keys.filter((key) => key in source).map((key) => [key, source[key]]),
  );
}

const NFL_STATE_FIELDS = [
  "season",
  "week",
  "league_season",
  "season_type",
  "leg",
  "display_week",
  "previous_season",
  "season_start_date",
  "league_create_season",
] as const;

const USER_FIELDS = ["user_id", "username", "display_name", "avatar"] as const;

const LEAGUE_FIELDS = [
  "league_id",
  "name",
  "sport",
  "season",
  "season_type",
  "status",
  "total_rosters",
  "avatar",
  "draft_id",
  "previous_league_id",
  "roster_positions",
  "settings",
  "scoring_settings",
] as const;

const ROSTER_FIELDS = [
  "roster_id",
  "league_id",
  "owner_id",
  "co_owners",
  "players",
  "starters",
  "reserve",
  "taxi",
  "settings",
  "metadata",
] as const;

const MEMBER_FIELDS = [
  "user_id",
  "username",
  "display_name",
  "avatar",
  "is_owner",
  "metadata",
] as const;

const MATCHUP_FIELDS = [
  "matchup_id",
  "roster_id",
  "points",
  "custom_points",
  "players",
  "starters",
  "players_points",
] as const;

const TRANSACTION_FIELDS = [
  "transaction_id",
  "type",
  "status",
  "roster_ids",
  "leg",
  "created",
  "status_updated",
  "creator",
  "consenter_ids",
  "adds",
  "drops",
  "draft_picks",
  "waiver_budget",
  "settings",
  "metadata",
] as const;

const TRADED_PICK_FIELDS = [
  "season",
  "round",
  "roster_id",
  "previous_owner_id",
  "owner_id",
] as const;

const DRAFT_FIELDS = [
  "draft_id",
  "league_id",
  "sport",
  "season",
  "season_type",
  "status",
  "type",
  "start_time",
  "created",
  "last_picked",
  "last_message_time",
  "last_message_id",
  "creators",
  "draft_order",
  "slot_to_roster_id",
  "settings",
  "metadata",
] as const;

const DRAFT_PICK_FIELDS = [
  "draft_id",
  "player_id",
  "picked_by",
  "roster_id",
  "round",
  "draft_slot",
  "pick_no",
  "is_keeper",
] as const;

const PLAYOFF_MATCHUP_FIELDS = [
  "r",
  "m",
  "t1",
  "t2",
  "t1_from",
  "t2_from",
  "w",
  "l",
  "p",
] as const;

const TRENDING_FIELDS = ["player_id", "count"] as const;

export function compactNflState(value: unknown): JsonRecord | null {
  const source = record(value);
  return source ? pick(source, NFL_STATE_FIELDS) : null;
}

export function compactUser(value: unknown): JsonRecord | null {
  const source = record(value);
  return source ? pick(source, USER_FIELDS) : null;
}

export function compactLeagues(value: unknown): JsonRecord[] {
  return records(value).map((league) => pick(league, LEAGUE_FIELDS));
}

export function compactLeague(value: unknown): JsonRecord | null {
  const source = record(value);
  return source ? pick(source, LEAGUE_FIELDS) : null;
}

export function compactRosters(value: unknown): JsonRecord[] {
  return records(value).map((roster) => pick(roster, ROSTER_FIELDS));
}

export function compactMembers(value: unknown): JsonRecord[] {
  return records(value).map((member) => pick(member, MEMBER_FIELDS));
}

export function compactMatchups(value: unknown): JsonRecord[] {
  return records(value).map((matchup) => pick(matchup, MATCHUP_FIELDS));
}

export function compactTransactions(value: unknown): JsonRecord[] {
  return records(value).map((transaction) =>
    pick(transaction, TRANSACTION_FIELDS),
  );
}

export function compactTradedPicks(value: unknown): JsonRecord[] {
  return records(value).map((tradedPick) =>
    pick(tradedPick, TRADED_PICK_FIELDS),
  );
}

export function compactDrafts(value: unknown): JsonRecord[] {
  return records(value).map((draft) => pick(draft, DRAFT_FIELDS));
}

export function compactDraft(value: unknown): JsonRecord | null {
  const source = record(value);
  return source ? pick(source, DRAFT_FIELDS) : null;
}

export function compactDraftPicks(value: unknown): JsonRecord[] {
  return records(value).map((draftPick) =>
    pick(draftPick, DRAFT_PICK_FIELDS),
  );
}

export function compactPlayoffBracket(value: unknown): JsonRecord[] {
  return records(value).map((matchup) =>
    pick(matchup, PLAYOFF_MATCHUP_FIELDS),
  );
}

export function compactTrending(value: unknown): JsonRecord[] {
  return records(value).map((entry) => pick(entry, TRENDING_FIELDS));
}
