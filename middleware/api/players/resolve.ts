import { handleResolvePlayers } from "../../src/handler.js";
import { playerMapCache } from "../../src/player-cache.js";

export async function POST(request: Request): Promise<Response> {
  return handleResolvePlayers(request, playerMapCache);
}
