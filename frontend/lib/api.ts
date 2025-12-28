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
export async function getPlayersForDate(date: string): Promise<Player[]> {
  const endpoint = `/api/players/tonight?game_date=${date}`;
  return fetchAPI<Player[]>(endpoint, { cache: 'no-store' });
}

/**
 * Client-side fetch for tonight's players (used after date navigation).
 */
export async function getTonightsPlayers(date?: string): Promise<Player[]> {
  const endpoint = date
    ? `/api/players/tonight?game_date=${date}`
    : '/api/players/tonight';

  return fetchAPI<Player[]>(endpoint);
}

export async function getPlayerStats(playerId: number): Promise<PlayerStats> {
  return await fetchAPI<PlayerStats>(`/api/players/${playerId}/stats`);
}

// pickPlayer removed - picks are now stored in localStorage via lib/picks.ts

export async function getPickHistory(limit: number = 50): Promise<PickHistory[]> {
  return await fetchAPI<PickHistory[]>(`/api/games/history?limit=${limit}`);
}
