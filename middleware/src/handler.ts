import { resolvePlayers } from "./player-resolver.js";
import type { PlayerMapProvider } from "./types.js";
import { validatePlayerIds } from "./validation.js";

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function handleResolvePlayers(
  request: Request,
  playerMapProvider: PlayerMapProvider,
): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: "Unable to read request body." }, 400);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Request body must contain valid JSON." }, 400);
  }

  const validation = validatePlayerIds(body);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  try {
    const playerMap = await playerMapProvider.get();
    return jsonResponse(resolvePlayers(validation.playerIds, playerMap));
  } catch (error) {
    console.error("Unable to load Sleeper player map", error);
    return jsonResponse(
      { error: "Sleeper player data is temporarily unavailable." },
      502,
    );
  }
}
