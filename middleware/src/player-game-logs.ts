import type {
  NflverseSeasonData,
  WeeklyTeamSchedule,
  WeeklyPlayerStat,
  WeeklySnapCount,
} from "./nflverse-client.js";
import type { SleeperPlayer, SleeperPlayerMap } from "./types.js";

export interface PlayerGameLogsInput {
  playerIds: string[];
  playerMap: SleeperPlayerMap;
  seasonData: NflverseSeasonData;
  season: string;
  throughWeek: number;
  gameLogLimit: number;
  scoringSettings: Record<string, unknown>;
  rosteredPlayerIds: Set<string>;
}

export interface PlayerGameLogResult extends Record<string, unknown> {
  data: PlayerGameLogSummary[];
  unresolved: Array<{ player_id: string; reason: string }>;
  unsupported_scoring_keys: string[];
  source: {
    provider: "nflverse";
    stats_url: string;
    snaps_url: string;
    schedule_url: string;
  };
}

export interface PlayerGameLogSummary {
  player_id: string;
  full_name: string;
  position: string | null;
  team: string | null;
  currently_available: boolean;
  mapping_method: "sleeper_gsis_id" | "exact_name_position" | "exact_name_position_team";
  source_player_id: string | null;
  games_played: number;
  averages: {
    season: number | null;
    last_3: number | null;
    last_5: number | null;
  };
  week_context: PlayerWeekContext;
  bye_weeks: number[];
  game_logs: PlayerWeekLog[];
}

export type PlayerWeekStatus =
  | "played"
  | "scheduled_no_player_stats"
  | "bye"
  | "data_unavailable"
  | "unknown_team";

export interface PlayerWeekContext {
  week: number;
  team: string | null;
  opponent: string | null;
  status: PlayerWeekStatus;
}

export interface PlayerWeekLog {
  week: number;
  game_id: string | null;
  team: string | null;
  opponent: string | null;
  fantasy_points: number;
  carries: number;
  targets: number;
  receptions: number;
  passing_yards: number;
  rushing_yards: number;
  receiving_yards: number;
  total_touches: number;
  tackles_solo: number;
  tackles_assists: number;
  tackles_for_loss: number;
  sacks: number;
  qb_hits: number;
  interceptions: number;
  passes_defended: number;
  forced_fumbles: number;
  fumble_recoveries: number;
  offense_snaps: number | null;
  offense_snap_pct: number | null;
  defense_snaps: number | null;
  defense_snap_pct: number | null;
  special_teams_snaps: number | null;
  special_teams_snap_pct: number | null;
}

type MappingMethod = PlayerGameLogSummary["mapping_method"];

interface PlayerMapping {
  method: MappingMethod;
  sourcePlayerId: string | null;
  playerName: string;
  position: string | null;
}

const SIMPLE_SCORING_MAP = {
  pass_att: "attempts",
  pass_cmp: "completions",
  pass_yd: "passing_yards",
  pass_td: "passing_tds",
  pass_int: "passing_interceptions",
  pass_sack: "sacks_suffered",
  pass_fd: "passing_first_downs",
  pass_2pt: "passing_2pt_conversions",
  rush_att: "carries",
  rush_yd: "rushing_yards",
  rush_td: "rushing_tds",
  rush_fd: "rushing_first_downs",
  rush_2pt: "rushing_2pt_conversions",
  rec: "receptions",
  rec_yd: "receiving_yards",
  rec_td: "receiving_tds",
  rec_fd: "receiving_first_downs",
  rec_2pt: "receiving_2pt_conversions",
  fum: "fumbles_total",
  fum_lost: "fumbles_lost_total",
  st_td: "special_teams_tds",
  pr_yd: "punt_return_yards",
  kr_yd: "kickoff_return_yards",
  idp_tkl_solo: "def_tackles_solo",
  idp_tkl_ast: "def_tackle_assists",
  idp_tkl_loss: "def_tackles_for_loss",
  idp_ff: "def_fumbles_forced",
  idp_sack: "def_sacks",
  idp_qb_hit: "def_qb_hits",
  idp_int: "def_interceptions",
  idp_pass_def: "def_pass_defended",
  idp_def_td: "def_tds",
  idp_safe: "def_safeties",
  idp_fum_rec: "fumble_recovery_opp",
  fum_rec_td: "fumble_recovery_tds",
  fgm: "fg_made",
  fgmiss: "fg_missed",
  fgm_0_19: "fg_made_0_19",
  fgm_20_29: "fg_made_20_29",
  fgm_30_39: "fg_made_30_39",
  fgm_40_49: "fg_made_40_49",
  fgm_50p: "fg_made_50_59",
  fgmiss_0_19: "fg_missed_0_19",
  fgmiss_20_29: "fg_missed_20_29",
  fgmiss_30_39: "fg_missed_30_39",
  fgmiss_40_49: "fg_missed_40_49",
  fgmiss_50p: "fg_missed_50_59",
  xpm: "pat_made",
  xpmiss: "pat_missed",
} as const;

const TEAM_DEFENSE_KEYS = new Set([
  "sack",
  "sack_yd",
  "int",
  "int_ret_yd",
  "ff",
  "fum_rec",
  "fum_ret_yd",
  "safe",
  "blk_kick",
  "def_td",
  "def_pr_yd",
  "def_kr_yd",
  "def_forced_punts",
  "def_3_and_out",
  "def_4_and_stop",
  "def_2pt",
  "def_st_td",
  "def_st_ff",
  "def_st_fum_rec",
]);

const DERIVED_SCORING_KEYS = new Set([
  "pass_inc",
  "idp_blk_kick",
  "fgm_60p",
  "fgmiss_60p",
  "bonus_pass_yd_300",
  "bonus_pass_yd_400",
  "bonus_rush_yd_100",
  "bonus_rush_yd_200",
  "bonus_rec_yd_100",
  "bonus_rec_yd_200",
  "bonus_rush_rec_yd_100",
  "bonus_rush_rec_yd_200",
  "bonus_pass_cmp_25",
  "bonus_rush_att_20",
  "bonus_rec_te",
  "bonus_rec_rb",
  "bonus_rec_wr",
  "bonus_tkl_10p",
]);

export function buildPlayerGameLogs(
  input: PlayerGameLogsInput,
): PlayerGameLogResult {
  const stats = input.seasonData.stats.filter(
    (line) =>
      line.season === input.season &&
      line.week <= input.throughWeek &&
      (line.season_type === null || line.season_type === "REG" || line.season_type === "regular"),
  );
  const snaps = input.seasonData.snaps.filter(
    (line) => line.season === input.season && line.week <= input.throughWeek,
  );
  const schedules = (input.seasonData.schedules ?? []).filter(
    (line) =>
      line.season === input.season &&
      line.week <= input.throughWeek &&
      (line.game_type === null || line.game_type === "REG"),
  );
  const unsupportedScoringKeys = findUnsupportedScoringKeys(input.scoringSettings);
  const data: PlayerGameLogSummary[] = [];
  const unresolved: Array<{ player_id: string; reason: string }> = [];

  for (const playerId of [...new Set(input.playerIds)]) {
    const player = input.playerMap[playerId];
    if (!player) {
      unresolved.push({ player_id: playerId, reason: "Sleeper player_id not found." });
      continue;
    }

    const mapping = mapPlayer(player, stats);
    if (!mapping) {
      unresolved.push({
        player_id: playerId,
        reason: "No unique nflverse player matched the Sleeper name and position.",
      });
      continue;
    }

    const playerStats = stats.filter((line) =>
      mapping.sourcePlayerId
        ? line.source_player_id === mapping.sourcePlayerId
        : normalizeName(line.player_name) === normalizeName(mapping.playerName) &&
          positionsCompatible(player.position, line.position),
    );
    const playerSnaps = snaps.filter(
      (line) =>
        normalizeName(line.player_name) === normalizeName(mapping.playerName) &&
        positionsCompatible(player.position, line.position),
    );
    const weeks = [...new Set([
      ...playerStats.map((line) => line.week),
      ...playerSnaps.map((line) => line.week),
    ])].sort((left, right) => left - right);

    const allLogs = weeks.map((requestedWeek) => {
      const stat = chooseWeekStat(playerStats, requestedWeek, player);
      const snap = chooseWeekSnap(playerSnaps, requestedWeek, stat?.team ?? stringValue(player.team));
      return createWeekLog(requestedWeek, stat, snap, input.scoringSettings, player);
    });
    const points = allLogs.map((log) => log.fantasy_points);
    const team =
      stringValue(player.team) ??
      [...allLogs].reverse().find((log) => log.team !== null)?.team ??
      null;
    const weekContext = buildWeekContext(
      input.throughWeek,
      team,
      schedules,
      allLogs,
    );

    data.push({
      player_id: playerId,
      full_name: playerFullName(player),
      position: stringValue(player.position),
      team,
      currently_available: !input.rosteredPlayerIds.has(playerId),
      mapping_method: mapping.method,
      source_player_id: mapping.sourcePlayerId,
      games_played: allLogs.length,
      averages: {
        season: average(points),
        last_3: average(points.slice(-3)),
        last_5: average(points.slice(-5)),
      },
      week_context: weekContext,
      bye_weeks: findByeWeeks(team, schedules, input.throughWeek),
      game_logs: allLogs.slice(-input.gameLogLimit).reverse(),
    });
  }

  return {
    data,
    unresolved,
    unsupported_scoring_keys: unsupportedScoringKeys,
    source: {
      provider: "nflverse",
      stats_url: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${input.season}.csv`,
      snaps_url: `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_${input.season}.csv`,
      schedule_url: "https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv",
    },
  };
}

function buildWeekContext(
  week: number,
  team: string | null,
  schedules: WeeklyTeamSchedule[],
  logs: PlayerWeekLog[],
): PlayerWeekContext {
  if (!team) {
    return { week, team: null, opponent: null, status: "unknown_team" };
  }
  const weekSchedules = schedules.filter((game) => game.week === week);
  if (weekSchedules.length === 0) {
    return { week, team, opponent: null, status: "data_unavailable" };
  }
  const game = weekSchedules.find((entry) => teamIsPlaying(entry, team));
  if (!game) {
    return { week, team, opponent: null, status: "bye" };
  }
  const opponent =
    normalizeTeam(game.home_team) === normalizeTeam(team)
      ? game.away_team
      : game.home_team;
  return {
    week,
    team,
    opponent,
    status: logs.some((log) => log.week === week)
      ? "played"
      : "scheduled_no_player_stats",
  };
}

function findByeWeeks(
  team: string | null,
  schedules: WeeklyTeamSchedule[],
  throughWeek: number,
): number[] {
  if (!team) return [];
  const scheduledWeeks = new Set(schedules.map((game) => game.week));
  const teamWeeks = new Set(
    schedules
      .filter((game) => teamIsPlaying(game, team))
      .map((game) => game.week),
  );
  return [...scheduledWeeks]
    .filter((week) => week <= throughWeek && !teamWeeks.has(week))
    .sort((left, right) => left - right);
}

function teamIsPlaying(game: WeeklyTeamSchedule, team: string): boolean {
  const normalized = normalizeTeam(team);
  return (
    normalizeTeam(game.home_team) === normalized ||
    normalizeTeam(game.away_team) === normalized
  );
}

function normalizeTeam(team: string): string {
  const normalized = team.toUpperCase();
  const aliases: Record<string, string> = {
    JAC: "JAX",
    LA: "LAR",
    OAK: "LV",
    SD: "LAC",
    STL: "LAR",
    WSH: "WAS",
  };
  return aliases[normalized] ?? normalized;
}

function mapPlayer(
  player: SleeperPlayer,
  stats: WeeklyPlayerStat[],
): PlayerMapping | null {
  const name = playerFullName(player);
  const normalizedName = normalizeName(name);
  const playerPosition = stringValue(player.position);
  const playerTeam = stringValue(player.team);
  const gsisId = stringValue(player.gsis_id);

  if (gsisId && stats.some((line) => line.source_player_id === gsisId)) {
    return {
      method: "sleeper_gsis_id",
      sourcePlayerId: gsisId,
      playerName: name,
      position: playerPosition,
    };
  }

  const namePositionCandidates = stats.filter(
    (line) =>
      normalizeName(line.player_name) === normalizedName &&
      positionsCompatible(playerPosition, line.position),
  );
  const sourceIds = [...new Set(namePositionCandidates.map((line) => line.source_player_id))];
  if (sourceIds.length === 1) {
    return {
      method: "exact_name_position",
      sourcePlayerId: sourceIds[0],
      playerName: namePositionCandidates[0]?.player_name ?? name,
      position: playerPosition,
    };
  }

  if (sourceIds.length > 1 && playerTeam) {
    const teamIds = [...new Set(
      namePositionCandidates
        .filter((line) => line.team === playerTeam)
        .map((line) => line.source_player_id),
    )];
    if (teamIds.length === 1) {
      const matched = namePositionCandidates.find((line) => line.source_player_id === teamIds[0]);
      return {
        method: "exact_name_position_team",
        sourcePlayerId: teamIds[0],
        playerName: matched?.player_name ?? name,
        position: playerPosition,
      };
    }
  }

  return null;
}

function chooseWeekStat(
  stats: WeeklyPlayerStat[],
  requestedWeek: number,
  player: SleeperPlayer,
): WeeklyPlayerStat | undefined {
  const weekStats = stats.filter((line) => line.week === requestedWeek);
  if (weekStats.length <= 1) return weekStats[0];
  const team = stringValue(player.team);
  return weekStats.find((line) => line.team === team) ?? weekStats[0];
}

function chooseWeekSnap(
  snaps: WeeklySnapCount[],
  requestedWeek: number,
  team: string | null,
): WeeklySnapCount | undefined {
  const weekSnaps = snaps.filter((line) => line.week === requestedWeek);
  if (weekSnaps.length <= 1) return weekSnaps[0];
  return weekSnaps.find((line) => line.team === team) ?? weekSnaps[0];
}

function createWeekLog(
  week: number,
  stat: WeeklyPlayerStat | undefined,
  snap: WeeklySnapCount | undefined,
  scoringSettings: Record<string, unknown>,
  player: SleeperPlayer,
): PlayerWeekLog {
  const metrics = stat?.metrics ?? {};
  const carries = metric(metrics, "carries");
  const receptions = metric(metrics, "receptions");
  return {
    week,
    game_id: stat?.game_id ?? null,
    team: stat?.team ?? snap?.team ?? stringValue(player.team),
    opponent: stat?.opponent_team ?? snap?.opponent_team ?? null,
    fantasy_points: scorePlayer(metrics, scoringSettings, stringValue(player.position)),
    carries,
    targets: metric(metrics, "targets"),
    receptions,
    passing_yards: metric(metrics, "passing_yards"),
    rushing_yards: metric(metrics, "rushing_yards"),
    receiving_yards: metric(metrics, "receiving_yards"),
    total_touches: carries + receptions,
    tackles_solo: metric(metrics, "def_tackles_solo"),
    tackles_assists: metric(metrics, "def_tackle_assists"),
    tackles_for_loss: metric(metrics, "def_tackles_for_loss"),
    sacks: metric(metrics, "def_sacks"),
    qb_hits: metric(metrics, "def_qb_hits"),
    interceptions: metric(metrics, "def_interceptions"),
    passes_defended: metric(metrics, "def_pass_defended"),
    forced_fumbles: metric(metrics, "def_fumbles_forced"),
    fumble_recoveries: metric(metrics, "fumble_recovery_opp"),
    offense_snaps: snap?.offense_snaps ?? null,
    offense_snap_pct: snap?.offense_pct ?? null,
    defense_snaps: snap?.defense_snaps ?? null,
    defense_snap_pct: snap?.defense_pct ?? null,
    special_teams_snaps: snap?.special_teams_snaps ?? null,
    special_teams_snap_pct: snap?.special_teams_pct ?? null,
  };
}

export function scorePlayer(
  metrics: Record<string, number>,
  scoringSettings: Record<string, unknown>,
  position: string | null,
): number {
  let score = 0;
  for (const [scoringKey, metricName] of Object.entries(SIMPLE_SCORING_MAP)) {
    score += setting(scoringSettings, scoringKey) * metric(metrics, metricName);
  }

  score += setting(scoringSettings, "pass_inc") * Math.max(
    0,
    metric(metrics, "attempts") - metric(metrics, "completions"),
  );
  score += setting(scoringSettings, "idp_blk_kick") * (
    metric(metrics, "def_punt_blocks") +
    metric(metrics, "def_pat_blocks") +
    metric(metrics, "def_fg_blocks")
  );
  score += setting(scoringSettings, "fgm_60p") * metric(metrics, "fg_made_60_");
  score += setting(scoringSettings, "fgmiss_60p") * metric(metrics, "fg_missed_60_");

  score += thresholdBonus(scoringSettings, "bonus_pass_yd_300", metric(metrics, "passing_yards"), 300);
  score += thresholdBonus(scoringSettings, "bonus_pass_yd_400", metric(metrics, "passing_yards"), 400);
  score += thresholdBonus(scoringSettings, "bonus_rush_yd_100", metric(metrics, "rushing_yards"), 100);
  score += thresholdBonus(scoringSettings, "bonus_rush_yd_200", metric(metrics, "rushing_yards"), 200);
  score += thresholdBonus(scoringSettings, "bonus_rec_yd_100", metric(metrics, "receiving_yards"), 100);
  score += thresholdBonus(scoringSettings, "bonus_rec_yd_200", metric(metrics, "receiving_yards"), 200);
  const rushRecYards = metric(metrics, "rushing_yards") + metric(metrics, "receiving_yards");
  score += thresholdBonus(scoringSettings, "bonus_rush_rec_yd_100", rushRecYards, 100);
  score += thresholdBonus(scoringSettings, "bonus_rush_rec_yd_200", rushRecYards, 200);
  score += thresholdBonus(scoringSettings, "bonus_pass_cmp_25", metric(metrics, "completions"), 25);
  score += thresholdBonus(scoringSettings, "bonus_rush_att_20", metric(metrics, "carries"), 20);
  score += thresholdBonus(
    scoringSettings,
    "bonus_tkl_10p",
    metric(metrics, "def_tackles_solo") + metric(metrics, "def_tackle_assists"),
    10,
  );

  const positionBonusKey =
    position === "TE" ? "bonus_rec_te" :
    position === "RB" ? "bonus_rec_rb" :
    position === "WR" ? "bonus_rec_wr" : null;
  if (positionBonusKey) {
    score += setting(scoringSettings, positionBonusKey) * metric(metrics, "receptions");
  }

  return round(score);
}

function findUnsupportedScoringKeys(
  scoringSettings: Record<string, unknown>,
): string[] {
  const supported = new Set<string>([
    ...Object.keys(SIMPLE_SCORING_MAP),
    ...DERIVED_SCORING_KEYS,
  ]);
  return Object.entries(scoringSettings)
    .filter(([, value]) => typeof value === "number" && value !== 0)
    .map(([key]) => key)
    .filter(
      (key) =>
        !supported.has(key) &&
        !TEAM_DEFENSE_KEYS.has(key) &&
        !key.startsWith("pts_allow_") &&
        !key.startsWith("yds_allow_"),
    )
    .sort();
}

function thresholdBonus(
  settings: Record<string, unknown>,
  key: string,
  value: number,
  threshold: number,
): number {
  return value >= threshold ? setting(settings, key) : 0;
}

function setting(settings: Record<string, unknown>, key: string): number {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function metric(metrics: Record<string, number>, name: string): number {
  const value = metrics[name];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function playerFullName(player: SleeperPlayer): string {
  const fullName = stringValue(player.full_name);
  if (fullName) return fullName;
  return [stringValue(player.first_name), stringValue(player.last_name)]
    .filter((value): value is string => value !== null)
    .join(" ");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function positionsCompatible(left: unknown, right: string | null): boolean {
  const leftPosition = typeof left === "string" ? left.toUpperCase() : "";
  const rightPosition = right?.toUpperCase() ?? "";
  if (!leftPosition || !rightPosition) return true;
  if (leftPosition === rightPosition) return true;
  const groups: Record<string, Set<string>> = {
    DB: new Set(["DB", "CB", "S", "SAF", "FS", "SS"]),
    DL: new Set(["DL", "DE", "DT", "NT", "EDGE"]),
    LB: new Set(["LB", "ILB", "OLB"]),
  };
  return groups[leftPosition]?.has(rightPosition) ??
    groups[rightPosition]?.has(leftPosition) ?? false;
}
