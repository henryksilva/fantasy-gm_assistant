export const NFLVERSE_STATS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player";
export const NFLVERSE_SNAPS_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/snap_counts";
export const NFLVERSE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_CACHED_SEASONS = 2;

export interface WeeklyPlayerStat {
  source_player_id: string;
  player_name: string;
  position: string | null;
  season: string;
  week: number;
  season_type: string | null;
  game_id: string | null;
  team: string | null;
  opponent_team: string | null;
  metrics: Record<string, number>;
}

export interface WeeklySnapCount {
  player_name: string;
  position: string | null;
  season: string;
  week: number;
  team: string | null;
  opponent_team: string | null;
  offense_snaps: number | null;
  offense_pct: number | null;
  defense_snaps: number | null;
  defense_pct: number | null;
  special_teams_snaps: number | null;
  special_teams_pct: number | null;
}

export interface NflverseSeasonData {
  stats: WeeklyPlayerStat[];
  snaps: WeeklySnapCount[];
}

export interface NflverseSeasonProvider {
  get(season: string): Promise<NflverseSeasonData>;
}

type SeasonLoader = (season: string) => Promise<NflverseSeasonData>;
type Clock = () => number;

interface CacheEntry {
  data: NflverseSeasonData;
  loadedAt: number;
}

const STAT_METRIC_FIELDS = [
  "completions",
  "attempts",
  "passing_yards",
  "passing_tds",
  "passing_interceptions",
  "sacks_suffered",
  "passing_first_downs",
  "passing_2pt_conversions",
  "carries",
  "rushing_yards",
  "rushing_tds",
  "rushing_first_downs",
  "rushing_2pt_conversions",
  "receptions",
  "targets",
  "receiving_yards",
  "receiving_tds",
  "receiving_first_downs",
  "receiving_2pt_conversions",
  "special_teams_tds",
  "def_tackles_solo",
  "def_tackle_assists",
  "def_tackles_for_loss",
  "def_fumbles_forced",
  "def_sacks",
  "def_qb_hits",
  "def_interceptions",
  "def_pass_defended",
  "def_tds",
  "def_safeties",
  "def_punt_blocks",
  "def_pat_blocks",
  "def_fg_blocks",
  "fumble_recovery_opp",
  "fumble_recovery_tds",
  "fumbles_total",
  "fumbles_lost_total",
  "punt_returns",
  "punt_return_yards",
  "kickoff_returns",
  "kickoff_return_yards",
  "fg_made",
  "fg_missed",
  "fg_blocked",
  "fg_made_0_19",
  "fg_made_20_29",
  "fg_made_30_39",
  "fg_made_40_49",
  "fg_made_50_59",
  "fg_made_60_",
  "fg_missed_0_19",
  "fg_missed_20_29",
  "fg_missed_30_39",
  "fg_missed_40_49",
  "fg_missed_50_59",
  "fg_missed_60_",
  "pat_made",
  "pat_missed",
  "fantasy_points",
  "fantasy_points_ppr",
] as const;

export class NflverseSeasonCache implements NflverseSeasonProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<NflverseSeasonData>>();

  constructor(
    private readonly loader: SeasonLoader,
    private readonly ttlMs = NFLVERSE_CACHE_TTL_MS,
    private readonly now: Clock = Date.now,
  ) {}

  async get(season: string): Promise<NflverseSeasonData> {
    const cached = this.cache.get(season);
    if (cached && this.now() - cached.loadedAt < this.ttlMs) {
      return cached.data;
    }

    const pending = this.inFlight.get(season);
    if (pending) {
      return pending;
    }

    const request = this.loader(season)
      .then((data) => {
        this.cache.set(season, { data, loadedAt: this.now() });
        while (this.cache.size > MAX_CACHED_SEASONS) {
          const oldestSeason = this.cache.keys().next().value as string | undefined;
          if (!oldestSeason) break;
          this.cache.delete(oldestSeason);
        }
        return data;
      })
      .finally(() => this.inFlight.delete(season));

    this.inFlight.set(season, request);
    return request;
  }
}

export async function fetchNflverseSeason(
  season: string,
): Promise<NflverseSeasonData> {
  const statsUrl = `${NFLVERSE_STATS_URL}/stats_player_week_${season}.csv`;
  const snapsUrl = `${NFLVERSE_SNAPS_URL}/snap_counts_${season}.csv`;
  const [statsCsv, snapsCsv] = await Promise.all([
    fetchCsv(statsUrl, "player stats"),
    fetchCsv(snapsUrl, "snap counts"),
  ]);

  return {
    stats: parsePlayerStatsCsv(statsCsv),
    snaps: parseSnapCountsCsv(snapsCsv),
  };
}

async function fetchCsv(url: string, label: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv",
      "User-Agent": "FantasyAssistGM/1.0",
    },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`nflverse ${label} returned HTTP ${response.status}.`);
  }
  return response.text();
}

export function parsePlayerStatsCsv(csv: string): WeeklyPlayerStat[] {
  return csvRecords(csv).flatMap((row) => {
    const sourcePlayerId = textValue(row.player_id);
    const playerName = textValue(row.player_display_name) ?? textValue(row.player_name);
    const week = integerValue(row.week);
    const season = textValue(row.season);
    if (!sourcePlayerId || !playerName || week === null || !season) {
      return [];
    }

    const metrics: Record<string, number> = {};
    for (const field of STAT_METRIC_FIELDS) {
      const value = numberValue(row[field]);
      if (value !== null) metrics[field] = value;
    }

    return [
      {
        source_player_id: sourcePlayerId,
        player_name: playerName,
        position: textValue(row.position),
        season,
        week,
        season_type: textValue(row.season_type),
        game_id: textValue(row.game_id),
        team: textValue(row.team),
        opponent_team: textValue(row.opponent_team),
        metrics,
      },
    ];
  });
}

export function parseSnapCountsCsv(csv: string): WeeklySnapCount[] {
  return csvRecords(csv).flatMap((row) => {
    const playerName = textValue(row.player);
    const week = integerValue(row.week);
    const season = textValue(row.season);
    if (!playerName || week === null || !season) return [];

    return [
      {
        player_name: playerName,
        position: textValue(row.position),
        season,
        week,
        team: textValue(row.team),
        opponent_team: textValue(row.opponent),
        offense_snaps: numberValue(row.offense_snaps),
        offense_pct: numberValue(row.offense_pct),
        defense_snaps: numberValue(row.defense_snaps),
        defense_pct: numberValue(row.defense_pct),
        special_teams_snaps: numberValue(row.st_snaps),
        special_teams_pct: numberValue(row.st_pct),
      },
    ];
  });
}

function csvRecords(csv: string): Array<Record<string, string>> {
  const rows = parseCsv(csv);
  const headers = rows.shift();
  if (!headers) return [];
  return rows
    .filter((row) => row.some((value) => value.length > 0))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
    );
}

export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
    rows.push(row);
  }
  return rows;
}

function textValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function numberValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: string | undefined): number | null {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

export const nflverseSeasonCache = new NflverseSeasonCache(fetchNflverseSeason);
