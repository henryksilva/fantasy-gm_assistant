import type {
  PlayerGameLogSummary,
  PlayerWeekStatus,
} from "./player-game-logs.js";
import type { SleeperPlayer, SleeperPlayerMap } from "./types.js";

export interface WaiverCandidateSelectionInput {
  playerMap: SleeperPlayerMap;
  rosteredPlayerIds: Set<string>;
  positions: string[];
  limit: number;
}

export interface RosterComparisonSelectionInput {
  playerMap: SleeperPlayerMap;
  players: string[];
  starters: string[];
  reserve: string[];
  taxi: string[];
  positions: string[];
  limit: number;
}

export interface RankedWaiverPlayer {
  player_id: string;
  full_name: string;
  position: string | null;
  team: string | null;
  games_played: number;
  season_average: number | null;
  last_3_average: number | null;
  last_5_average: number | null;
  recent_snap_pct: number | null;
  recent_opportunities: number;
  week_status: PlayerWeekStatus;
  week_opponent: string | null;
  is_on_bye: boolean;
  waiver_score: number;
  score_components: {
    production: number;
    usage: number;
    trend: number;
    reliability: number;
  };
  signals: string[];
}

interface RawRankingMetrics {
  summary: PlayerGameLogSummary;
  production: number;
  usage: number;
  trend: number;
  reliability: number;
  recentSnapPct: number | null;
  recentOpportunities: number;
}

export const WAIVER_SCORE_WEIGHTS = {
  production: 0.55,
  usage: 0.25,
  trend: 0.15,
  reliability: 0.05,
} as const;

export function selectAvailablePlayerIds(
  input: WaiverCandidateSelectionInput,
): string[] {
  return Object.entries(input.playerMap)
    .filter(
      ([playerId, player]) =>
        !input.rosteredPlayerIds.has(playerId) &&
        player.active === true &&
        matchesPositions(player, input.positions),
    )
    .sort(compareSearchRank)
    .slice(0, input.limit)
    .map(([playerId]) => playerId);
}

export function selectRosterComparisonIds(
  input: RosterComparisonSelectionInput,
): string[] {
  const protectedIds = new Set([
    ...input.starters,
    ...input.reserve,
    ...input.taxi,
    "0",
  ]);
  return [...new Set(input.players)]
    .filter((playerId) => {
      const player = input.playerMap[playerId];
      return Boolean(
        player &&
          !protectedIds.has(playerId) &&
          matchesPositions(player, input.positions),
      );
    })
    .sort((leftId, rightId) => {
      const left = input.playerMap[leftId];
      const right = input.playerMap[rightId];
      return compareSearchRank([rightId, right], [leftId, left]);
    })
    .slice(0, input.limit);
}

export function rankWaiverPlayers(
  summaries: PlayerGameLogSummary[],
): RankedWaiverPlayer[] {
  const metrics = summaries.map(createRawMetrics);
  const productionValues = metrics.map((entry) => entry.production);
  const usageValues = metrics.map((entry) => entry.usage);
  const trendValues = metrics.map((entry) => entry.trend);
  const reliabilityValues = metrics.map((entry) => entry.reliability);

  return metrics
    .map((entry) => {
      const production = relativeScore(entry.production, productionValues);
      const usage = relativeScore(entry.usage, usageValues);
      const trend = relativeScore(entry.trend, trendValues);
      const reliability = relativeScore(entry.reliability, reliabilityValues);
      const waiverScore = round(
        production * WAIVER_SCORE_WEIGHTS.production +
          usage * WAIVER_SCORE_WEIGHTS.usage +
          trend * WAIVER_SCORE_WEIGHTS.trend +
          reliability * WAIVER_SCORE_WEIGHTS.reliability,
      );
      return {
        player_id: entry.summary.player_id,
        full_name: entry.summary.full_name,
        position: entry.summary.position,
        team: entry.summary.team,
        games_played: entry.summary.games_played,
        season_average: entry.summary.averages.season,
        last_3_average: entry.summary.averages.last_3,
        last_5_average: entry.summary.averages.last_5,
        recent_snap_pct: entry.recentSnapPct,
        recent_opportunities: entry.recentOpportunities,
        week_status: entry.summary.week_context.status,
        week_opponent: entry.summary.week_context.opponent,
        is_on_bye: entry.summary.week_context.status === "bye",
        waiver_score: waiverScore,
        score_components: {
          production,
          usage,
          trend,
          reliability,
        },
        signals: buildSignals(entry),
      };
    })
    .sort(
      (left, right) =>
        right.waiver_score - left.waiver_score ||
        (right.last_3_average ?? -Infinity) -
          (left.last_3_average ?? -Infinity) ||
        left.full_name.localeCompare(right.full_name),
    );
}

function createRawMetrics(summary: PlayerGameLogSummary): RawRankingMetrics {
  const season = summary.averages.season ?? 0;
  const last3 = summary.averages.last_3 ?? season;
  const last5 = summary.averages.last_5 ?? season;
  const recentLogs = summary.game_logs.slice(0, 3);
  const snapValues = recentLogs
    .map((log) =>
      Math.max(
        normalizeSnapPct(log.offense_snap_pct),
        normalizeSnapPct(log.defense_snap_pct),
      ),
    )
    .filter((value) => value > 0);
  const recentSnapPct = snapValues.length
    ? round(snapValues.reduce((sum, value) => sum + value, 0) / snapValues.length)
    : null;
  const recentOpportunities = recentLogs.length
    ? round(
        recentLogs.reduce(
          (sum, log) =>
            sum +
            log.carries +
            log.targets +
            log.tackles_solo +
            log.tackles_assists +
            log.qb_hits +
            log.passes_defended,
          0,
        ) / recentLogs.length,
      )
    : 0;

  return {
    summary,
    production: last3 * 0.5 + last5 * 0.3 + season * 0.2,
    usage: (recentSnapPct ?? 0) + Math.min(recentOpportunities * 2, 30),
    trend: last3 - season,
    reliability: Math.min(summary.games_played, 8),
    recentSnapPct,
    recentOpportunities,
  };
}

function buildSignals(entry: RawRankingMetrics): string[] {
  const signals: string[] = [];
  if (entry.summary.week_context.status === "bye") {
    signals.push("The player's NFL team is on bye in the requested week.");
  }
  const season = entry.summary.averages.season;
  const last3 = entry.summary.averages.last_3;
  if (season !== null && last3 !== null && last3 >= season + 1) {
    signals.push("Recent production is above the season average.");
  }
  if (entry.recentSnapPct !== null && entry.recentSnapPct >= 70) {
    signals.push("Recent offensive or defensive snap share is at least 70%.");
  }
  if (entry.recentOpportunities >= 8) {
    signals.push("Recent touches, targets, or defensive opportunities are elevated.");
  }
  if (entry.summary.games_played < 3) {
    signals.push("Small sample: fewer than three games are available.");
  }
  if (signals.length === 0) {
    signals.push("No strong recent trend signal was detected.");
  }
  return signals;
}

function relativeScore(value: number, allValues: number[]): number {
  if (allValues.length <= 1) return 50;
  const sorted = [...allValues].sort((left, right) => left - right);
  const below = sorted.filter((candidate) => candidate < value).length;
  const equal = sorted.filter((candidate) => candidate === value).length;
  return round(((below + (equal - 1) / 2) / (sorted.length - 1)) * 100);
}

function matchesPositions(player: SleeperPlayer, positions: string[]): boolean {
  if (positions.length === 0) return true;
  const fantasyPositions = Array.isArray(player.fantasy_positions)
    ? player.fantasy_positions
    : [];
  const playerPositions = [player.position, ...fantasyPositions]
    .filter((value): value is string => typeof value === "string")
    .map((value) => normalizePosition(value));
  return positions.some((position) =>
    playerPositions.includes(normalizePosition(position)),
  );
}

function normalizePosition(position: string): string {
  const value = position.toUpperCase();
  if (["CB", "S", "SAF", "FS", "SS"].includes(value)) return "DB";
  if (["DE", "DT", "NT", "EDGE"].includes(value)) return "DL";
  if (["ILB", "OLB"].includes(value)) return "LB";
  return value;
}

function compareSearchRank(
  [, left]: [string, SleeperPlayer],
  [, right]: [string, SleeperPlayer],
): number {
  const rankDifference = playerSearchRank(left) - playerSearchRank(right);
  if (rankDifference !== 0) return rankDifference;
  return playerName(left).localeCompare(playerName(right));
}

function playerSearchRank(player: SleeperPlayer): number {
  return typeof player.search_rank === "number" && Number.isFinite(player.search_rank)
    ? player.search_rank
    : Number.MAX_SAFE_INTEGER;
}

function playerName(player: SleeperPlayer): string {
  if (typeof player.full_name === "string") return player.full_name;
  return [player.first_name, player.last_name]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function normalizeSnapPct(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 0;
  return round(Math.min(value <= 1 ? value * 100 : value, 100));
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
