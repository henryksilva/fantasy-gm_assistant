export type SleeperPlayer = Record<string, unknown>;

export type SleeperPlayerMap = Record<string, SleeperPlayer>;

export interface CompactPlayer {
  player_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  fantasy_positions: string[];
  team: string | null;
  active: boolean | null;
  status: string | null;
  injury_status: string | null;
  age: number | null;
  years_exp: number | null;
}

export interface ResolvePlayersResponse {
  players: CompactPlayer[];
  not_found: string[];
}

export interface PlayerMapProvider {
  get(): Promise<SleeperPlayerMap>;
}
