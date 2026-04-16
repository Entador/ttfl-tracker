import { SnapshotData, PlayerSnapshot, TeamSnapshot, GameSnapshot } from './api';

export interface EnrichedPlayer extends PlayerSnapshot {
  opponent: string;
  is_home: boolean;
  opp_pace: number;
  opp_def_rating: number;
  is_back_to_back: boolean;
}

export interface StatRange {
  min: number;
  max: number;
  median: number;
}

export interface StatRanges {
  pace: StatRange;
  defRating: StatRange;
}

export function computeStatRanges(teams: TeamSnapshot[]): StatRanges {
  const empty: StatRange = { min: 0, max: 0, median: 0 };

  const getRange = (values: number[]): StatRange => {
    if (values.length === 0) return empty;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { min: sorted[0], max: sorted[sorted.length - 1], median };
  };

  return {
    pace: getRange(teams.map((t) => t.pace).filter((v) => v !== null && !isNaN(v))),
    defRating: getRange(teams.map((t) => t.def_rating).filter((v) => v !== null && !isNaN(v))),
  };
}

export interface GameFilterOption {
  key: string;
  awayTeam: string;
  homeTeam: string;
  label: string;
}

export function formatGamesForFilter(games: GameSnapshot[]): GameFilterOption[] {
  return games.map((game) => {
    const key = `${game.away_team}-${game.home_team}`;
    return {
      key,
      awayTeam: game.away_team,
      homeTeam: game.home_team,
      label: `${game.away_team} @ ${game.home_team}`,
    };
  });
}

export function formatInjuryUpdateTime(timestamp: string | null): string | null {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'Europe/Paris',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  });
}

export function getDeadlineForDate(
  snapshot: SnapshotData,
  currentDate: string
): string | null {
  const timeUtc = snapshot.metadata.earliest_game_times?.[currentDate];
  if (!timeUtc) return null;

  const gameDate = new Date(timeUtc);
  const parisDateStr = gameDate.toLocaleDateString('en-CA', {
    timeZone: 'Europe/Paris',
  });

  if (parisDateStr !== currentDate) return 'midnight';

  return gameDate.toLocaleTimeString('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get players playing on a specific date with enriched matchup data.
 */
export function getPlayersForDate(
  snapshot: SnapshotData,
  targetDate: string
): EnrichedPlayer[] {
  // Filter games for target date
  const gamesForDate = snapshot.games.filter(g => g.game_date === targetDate);

  if (gamesForDate.length === 0) return [];

  // Build team lookup
  const teamMap = new Map<number, TeamSnapshot>();
  snapshot.teams.forEach(t => teamMap.set(t.team_id, t));

  // Compute back-to-back: teams that also played the previous day
  const prevDate = new Date(targetDate);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);
  const prevDayTeamIds = new Set(
    snapshot.games
      .filter(g => g.game_date === prevDateStr)
      .flatMap(g => [g.home_team_id, g.away_team_id])
  );

  const players: EnrichedPlayer[] = [];

  for (const game of gamesForDate) {
    const homeTeam = teamMap.get(game.home_team_id);
    const awayTeam = teamMap.get(game.away_team_id);

    if (!homeTeam || !awayTeam) continue;

    // Home players
    const homePlayers = snapshot.players.filter(p => p.team_id === game.home_team_id);
    players.push(...homePlayers.map(p => ({
      ...p,
      opponent: awayTeam.abbreviation,
      is_home: true,
      opp_pace: awayTeam.pace,
      opp_def_rating: awayTeam.def_rating,
      is_back_to_back: prevDayTeamIds.has(game.home_team_id),
    })));

    // Away players
    const awayPlayers = snapshot.players.filter(p => p.team_id === game.away_team_id);
    players.push(...awayPlayers.map(p => ({
      ...p,
      opponent: homeTeam.abbreviation,
      is_home: false,
      opp_pace: homeTeam.pace,
      opp_def_rating: homeTeam.def_rating,
      is_back_to_back: prevDayTeamIds.has(game.away_team_id),
    })));
  }

  return players;
}

/**
 * Get games for a specific date.
 */
export function getGamesForDate(snapshot: SnapshotData, targetDate: string) {
  return snapshot.games.filter(g => g.game_date === targetDate);
}
