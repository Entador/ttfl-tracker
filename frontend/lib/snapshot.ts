import { SnapshotData, PlayerSnapshot, TeamSnapshot } from './api';

export interface EnrichedPlayer extends PlayerSnapshot {
  opponent: string;
  is_home: boolean;
  opp_pace: number;
  opp_def_rating: number;
  is_back_to_back: boolean;
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
