const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface Player {
  player_id: number;
  name: string;
  team: string;
  opponent: string;
  is_home: boolean;
  avg_ttfl: number;
  avg_ttfl_l10: number;
  avg_ttfl_l30d: number;
  is_eligible: boolean;
  last_picked_date: string | null;
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

export interface PickRequest {
  player_id: number;
  game_date: string;
  opponent: string;
  is_home: boolean;
  ttfl_score?: number;
}

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

export async function getTonightsPlayers(date?: string): Promise<Player[]> {
  // Build URL with optional date query param
  const endpoint = date
    ? `/api/players/tonight?game_date=${date}`
    : '/api/players/tonight';

  return await fetchAPI<Player[]>(endpoint);
}

export async function getPlayerStats(playerId: number): Promise<PlayerStats> {
  return await fetchAPI<PlayerStats>(`/api/players/${playerId}/stats`);
}

export async function pickPlayer(pick: PickRequest): Promise<{ message: string; game_id: number }> {
  return await fetchAPI('/api/games/pick', {
    method: 'POST',
    body: JSON.stringify(pick),
  });
}

export async function getPickHistory(limit: number = 50): Promise<PickHistory[]> {
  return await fetchAPI<PickHistory[]>(`/api/games/history?limit=${limit}`);
}
