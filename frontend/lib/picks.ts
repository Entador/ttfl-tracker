/**
 * Local storage utility for managing TTFL picks.
 * Picks are stored as an array of { playerId, date } objects.
 */

const STORAGE_KEY = 'ttfl-picks';

export interface Pick {
  playerId: number;
  date: string; // YYYY-MM-DD format
  isSkipped?: boolean; // true if date was intentionally skipped (no pick made)
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
    .filter(p => !p.isSkipped) // Ignore skipped dates
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

/**
 * Convert Date object to YYYY-MM-DD string format
 */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Mark a date as intentionally skipped (no pick made).
 */
export function skipDate(date: string): void {
  savePick(-1, date);

  // Update the pick to set isSkipped flag
  const picks = getAllPicks();
  const updated = picks.map(p =>
    p.date === date ? { ...p, isSkipped: true } : p
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Check if a date was marked as skipped.
 */
export function isDateSkipped(date: string): boolean {
  const pick = getPickForDate(date);
  return pick?.isSkipped === true;
}

/**
 * Detect dates in the last 30 days that had scheduled games but no pick/skip recorded.
 * Returns array of forgotten dates sorted from oldest to newest.
 */
export function getForgottenDates(snapshot: any, currentDate: string): string[] {
  if (typeof window === 'undefined') return [];

  const current = new Date(currentDate);
  const forgottenDates: string[] = [];
  const picks = getAllPicks();

  // Build a Set of dates with picks/skips for O(1) lookup
  const pickedDates = new Set(picks.map(p => p.date));

  // Check each of the last 30 days (1-30 days ago, NOT including current date)
  for (let i = 1; i <= 30; i++) {
    const checkDate = new Date(current);
    checkDate.setDate(current.getDate() - i);
    const dateStr = toDateKey(checkDate);

    // Skip if pick/skip already exists
    if (pickedDates.has(dateStr)) continue;

    // Check if games were scheduled for this date
    // Requires getGamesForDate from snapshot.ts - we'll import dynamically
    const gamesForDate = snapshot.games.filter((g: any) => g.game_date === dateStr);
    if (gamesForDate.length > 0) {
      forgottenDates.push(dateStr);
    }
  }

  return forgottenDates.sort(); // Oldest first
}

/**
 * Import multiple picks at once.
 * Merges with existing picks, replacing duplicates by date.
 * Keeps only the last 30 days of picks from today.
 */
export function importPicks(newPicks: Pick[]): { imported: number; skipped: number } {
  const existingPicks = getAllPicks();
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Create a map of date -> pick for both existing and new picks
  const picksByDate = new Map<string, Pick>();

  // Add existing picks
  existingPicks.forEach(pick => {
    picksByDate.set(pick.date, pick);
  });

  // Add/override with new picks
  let imported = 0;
  let skipped = 0;

  newPicks.forEach(pick => {
    const pickDate = new Date(pick.date);

    // Only import picks from the last 30 days
    if (pickDate >= thirtyDaysAgo && pickDate <= today) {
      picksByDate.set(pick.date, pick);
      imported++;
    } else {
      skipped++;
    }
  });

  // Convert back to array and save
  const allPicks = Array.from(picksByDate.values());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allPicks));

  return { imported, skipped };
}
