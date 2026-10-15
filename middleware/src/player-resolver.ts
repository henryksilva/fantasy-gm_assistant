import type {
  CompactPlayer,
  ResolvePlayersResponse,
  SleeperPlayer,
  SleeperPlayerMap,
} from "./types.js";

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function compactPlayer(playerId: string, player: SleeperPlayer): CompactPlayer {
  const firstName = nullableString(player.first_name);
  const lastName = nullableString(player.last_name);
  const derivedFullName = [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    player_id: nullableString(player.player_id) ?? playerId,
    full_name: nullableString(player.full_name) ?? derivedFullName,
    first_name: firstName,
    last_name: lastName,
    position: nullableString(player.position),
    fantasy_positions: stringArray(player.fantasy_positions),
    team: nullableString(player.team),
    active: nullableBoolean(player.active),
    status: nullableString(player.status),
    injury_status: nullableString(player.injury_status),
    age: nullableNumber(player.age),
    years_exp: nullableNumber(player.years_exp),
  };
}

export function resolvePlayers(
  playerIds: string[],
  playerMap: SleeperPlayerMap,
): ResolvePlayersResponse {
  const players: CompactPlayer[] = [];
  const notFound: string[] = [];

  for (const playerId of playerIds) {
    const player = playerMap[playerId];
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      notFound.push(playerId);
      continue;
    }

    players.push(compactPlayer(playerId, player));
  }

  return { players, not_found: notFound };
}
