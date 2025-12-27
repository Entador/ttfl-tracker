/**
 * Local storage utility for managing TTFL picks.
 * Picks are stored as an array of { playerId, date } objects.
 */

const STORAGE_KEY = 'ttfl-picks';

export interface Pick {
  playerId: number;
  date: string; // YYYY-MM-DD format
}

/**
 * Get all picks from localStorage
 */
export function getAllPicks(): Pick[] {
  if (typeof window === 'undefined') return [];

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save a pick for a specific date.
 * Replaces any existing pick for that date.
 */
export function savePick(playerId: number, date: string): void {
  const picks = getAllPicks();

  // Remove existing pick for this date (if any)
  const filtered = picks.filter(p => p.date !== date);

  // Add new pick
  filtered.push({ playerId, date });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Remove pick for a specific date
 */
export function removePick(date: string): void {
  const picks = getAllPicks();
  const filtered = picks.filter(p => p.date !== date);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Get pick for a specific date (if any)
 */
export function getPickForDate(date: string): Pick | null {
  const picks = getAllPicks();
  return picks.find(p => p.date === date) || null;
}

/**
 * Check if a player was picked within the last 30 days from a given date.
 * Returns the date they were last picked, or null if eligible.
 *
 * Note: A pick on fromDate itself does NOT make the player ineligible for that date.
 * The 30-day lock only applies to future dates.
 */
export function getLastPickedDate(playerId: number, fromDate: string): string | null {
  const picks = getAllPicks();
  const from = new Date(fromDate);

  // Find picks for this player within 30 days before fromDate (excluding fromDate itself)
  const recentPick = picks
    .filter(p => p.playerId === playerId)
    .filter(p => {
      const pickDate = new Date(p.date);
      const diffDays = Math.floor((from.getTime() - pickDate.getTime()) / (1000 * 60 * 60 * 24));
      // Pick counts if it was 1-29 days ago (within 30-day window, but NOT same day)
      return diffDays > 0 && diffDays < 30;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  return recentPick?.date || null;
}

/**
 * Check if a player is eligible (not picked in last 30 days)
 */
export function isPlayerEligible(playerId: number, forDate: string): boolean {
  return getLastPickedDate(playerId, forDate) === null;
}

/**
 * Get the number of days remaining until a player is eligible again.
 * Returns null if player is already eligible.
 */
export function getDaysUntilEligible(playerId: number, forDate: string): number | null {
  const lastPicked = getLastPickedDate(playerId, forDate);
  if (!lastPicked) return null;

  const from = new Date(forDate);
  const pickDate = new Date(lastPicked);
  const daysSincePick = Math.floor((from.getTime() - pickDate.getTime()) / (1000 * 60 * 60 * 24));

  return 30 - daysSincePick;
}
