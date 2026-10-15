import type { PlayerMapProvider, SleeperPlayerMap } from "./types.js";

export const PLAYER_MAP_URL = "https://api.sleeper.app/v1/players/nfl";
export const PLAYER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 20_000;

type Loader = () => Promise<SleeperPlayerMap>;
type Clock = () => number;

export class PlayerMapCache implements PlayerMapProvider {
  private cachedMap: SleeperPlayerMap | null = null;
  private loadedAt = 0;
  private inFlight: Promise<SleeperPlayerMap> | null = null;

  constructor(
    private readonly loader: Loader,
    private readonly ttlMs = PLAYER_CACHE_TTL_MS,
    private readonly now: Clock = Date.now,
  ) {}

  async get(): Promise<SleeperPlayerMap> {
    if (this.cachedMap && this.now() - this.loadedAt < this.ttlMs) {
      return this.cachedMap;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.loader()
      .then((playerMap) => {
        this.cachedMap = playerMap;
        this.loadedAt = this.now();
        return playerMap;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}

export async function fetchSleeperPlayerMap(): Promise<SleeperPlayerMap> {
  const response = await fetch(PLAYER_MAP_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Sleeper player endpoint returned HTTP ${response.status}.`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Sleeper player endpoint returned an invalid payload.");
  }

  return body as SleeperPlayerMap;
}

export const playerMapCache = new PlayerMapCache(fetchSleeperPlayerMap);
