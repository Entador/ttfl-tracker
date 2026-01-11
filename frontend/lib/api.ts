// Use internal Docker hostname for server-side, public URL for client-side
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Get today's date in Eastern Time (America/New_York).
 * NBA schedule uses ET, so we align with it for consistent "tonight" behavior.
 */
export function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  });
}

export interface Player {
  player_id: number;
  name: string;
  team: string;
  opponent: string;
  is_home: boolean;
  avg_ttfl: number;
  avg_ttfl_l10: number;
  avg_ttfl_l30d: number;
  opp_pace: number | null;
  opp_def_rating: number | null;
  injury_status: string | null;
  injury_return_date: string | null;
  injury_details: string | null;
}

export interface GameInfo {
  away_team: string;
  home_team: string;
}

export interface PlayersResponse {
  players: Player[];
  games: GameInfo[];
}

export interface PlayerStats {
  player: {
    id: number;
    name: string;
    team: string;
  };
  recent_games: Array<{
    game_date: string;
    opponent: string;
    is_home: boolean;
    ttfl_score: number;
    minutes: number;
    picked: boolean;
  }>;
  avg_ttfl: number;
}

export interface PickHistory {
  date: string;
  player_id: number;
  player_name: string;
  team: string;
  opponent: string;
  is_home: boolean;
  ttfl_score: number;
}

/**
 * Fetch from API - works both server-side and client-side.
 * Server-side: uses cache: 'no-store' for fresh data
 * Client-side: standard fetch
 */
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

/**
 * Server-side fetch for tonight's players.
 * Uses cache: 'no-store' to always get fresh data.
 */
export async function getPlayersForDate(date: string): Promise<PlayersResponse> {
  const endpoint = `/api/players/tonight?game_date=${date}`;
  return fetchAPI<PlayersResponse>(endpoint, { cache: 'no-store' });
}

/**
 * Client-side fetch for tonight's players (used after date navigation).
 */
export async function getTonightsPlayers(date?: string): Promise<PlayersResponse> {
  const endpoint = date
    ? `/api/players/tonight?game_date=${date}`
    : '/api/players/tonight';

  return fetchAPI<PlayersResponse>(endpoint);
}

export async function getPlayerStats(playerId: number): Promise<PlayerStats> {
  return await fetchAPI<PlayerStats>(`/api/players/${playerId}/stats`);
}

// pickPlayer removed - picks are now stored in localStorage via lib/picks.ts

export async function getPickHistory(limit: number = 50): Promise<PickHistory[]> {
  return await fetchAPI<PickHistory[]>(`/api/games/history?limit=${limit}`);
}

// Snapshot API - returns entire season data
export interface SnapshotMetadata {
  generated_at: string;
  total_players: number;
  total_games: number;
  total_teams: number;
  injury_updated_at: string | null;
}

export interface PlayerSnapshot {
  player_id: number;
  name: string;
  team: string;
  team_id: number;
  avg_ttfl: number;
  avg_ttfl_l10: number;
  avg_ttfl_l30d: number;
  injury_status: string | null;
  injury_return_date: string | null;
  injury_details: string | null;
}

export interface GameSnapshot {
  game_date: string;
  home_team: string;
  away_team: string;
  home_team_id: number;
  away_team_id: number;
}

export interface TeamSnapshot {
  team_id: number;
  abbreviation: string;
  full_name: string;
  pace: number;
  def_rating: number;
}

export interface SnapshotData {
  metadata: SnapshotMetadata;
  players: PlayerSnapshot[];
  games: GameSnapshot[];
  teams: TeamSnapshot[];
}

export async function getSnapshot(): Promise<SnapshotData> {
  return fetchAPI<SnapshotData>('/api/snapshot');
}
