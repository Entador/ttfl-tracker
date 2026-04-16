import { EnrichedPlayer } from './snapshot';

export type SortOption = 'avg-desc' | 'avg-asc' | 'name-asc' | 'name-desc';
export type FilterOption = 'all' | 'available' | 'locked';

export interface PlayerWithEligibility extends EnrichedPlayer {
  is_eligible: boolean;
  last_picked_date: string | null;
  days_until_eligible: number | null;
}

export function filterAndSortPlayers(
  players: PlayerWithEligibility[],
  filterBy: FilterOption,
  sortBy: SortOption,
  selectedGame: string | null
): PlayerWithEligibility[] {
  let filtered = [...players];

  if (filterBy === 'available') {
    filtered = filtered.filter((p) => p.is_eligible);
  } else if (filterBy === 'locked') {
    filtered = filtered.filter((p) => !p.is_eligible);
  }

  if (selectedGame) {
    filtered = filtered.filter((player) => {
      const gameKey = player.is_home
        ? `${player.opponent}-${player.team}`
        : `${player.team}-${player.opponent}`;
      return gameKey === selectedGame;
    });
  }

  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'avg-desc':
        return b.avg_ttfl_l10 - a.avg_ttfl_l10;
      case 'avg-asc':
        return a.avg_ttfl_l10 - b.avg_ttfl_l10;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      default:
        return 0;
    }
  });

  return filtered;
}
