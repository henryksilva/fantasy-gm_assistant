const MAX_PLAYER_IDS = 100;
const MAX_PLAYER_ID_LENGTH = 64;

export type ValidationResult =
  | { ok: true; playerIds: string[] }
  | { ok: false; error: string };

export function validatePlayerIds(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  if (!("player_ids" in body)) {
    return { ok: false, error: "player_ids is required." };
  }

  const playerIds = (body as { player_ids?: unknown }).player_ids;
  if (!Array.isArray(playerIds)) {
    return { ok: false, error: "player_ids must be an array." };
  }

  if (playerIds.length > MAX_PLAYER_IDS) {
    return {
      ok: false,
      error: `player_ids must contain at most ${MAX_PLAYER_IDS} items.`,
    };
  }

  const uniqueIds: string[] = [];
  const seen = new Set<string>();

  for (const value of playerIds) {
    if (typeof value !== "string") {
      return { ok: false, error: "Every player_id must be a string." };
    }

    const playerId = value.trim();
    if (playerId.length === 0) {
      return { ok: false, error: "player_ids cannot contain empty strings." };
    }
    if (playerId.length > MAX_PLAYER_ID_LENGTH) {
      return {
        ok: false,
        error: `Each player_id must contain at most ${MAX_PLAYER_ID_LENGTH} characters.`,
      };
    }

    if (!seen.has(playerId)) {
      seen.add(playerId);
      uniqueIds.push(playerId);
    }
  }

  return { ok: true, playerIds: uniqueIds };
}
