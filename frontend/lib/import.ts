/**
 * Import utility for TTFL historical picks.
 * Parses TSV data from TTFL website and matches player names to IDs.
 */

import { getAllPlayers, PlayerBasic } from './api';
import { Pick } from './picks';

/**
 * Normalize a player name for matching.
 * Removes diacritics, converts to lowercase, removes extra spaces.
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Parse TSV data from TTFL website.
 * Expected format (tab-separated):
 * Date	Joueur	Pts	Reb	Ast	Stl	Blk	Ftm	Fgm	Fg3m	Malus	Score	[Bonus x2]
 *
 * Returns array of { date, playerName }
 */
function parseTTFLData(tsvData: string): { date: string; playerName: string }[] {
  const lines = tsvData.trim().split('\n');
  const results: { date: string; playerName: string }[] = [];

  for (const line of lines) {
    const columns = line.split('\t');

    // Skip header rows or invalid rows
    if (columns.length < 2) continue;
    if (columns[0] === 'Date' || columns[0] === 'Joueur') continue;

    const date = columns[0]?.trim();
    const playerName = columns[1]?.trim();

    // Validate date format (YYYY-MM-DD)
    if (!date || !playerName || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    results.push({ date, playerName });
  }

  return results;
}

/**
 * Match player names to player IDs using fuzzy matching.
 */
function matchPlayerNames(
  parsedData: { date: string; playerName: string }[],
  allPlayers: PlayerBasic[]
): { matches: Pick[]; unmatched: string[] } {
  // Build normalized name lookup
  const playersByNormalizedName = new Map<string, PlayerBasic>();
  allPlayers.forEach(player => {
    const normalized = normalizeName(player.name);
    playersByNormalizedName.set(normalized, player);
  });

  const matches: Pick[] = [];
  const unmatched: string[] = [];

  for (const { date, playerName } of parsedData) {
    const normalized = normalizeName(playerName);
    const player = playersByNormalizedName.get(normalized);

    if (player) {
      matches.push({
        playerId: player.player_id,
        date,
      });
    } else {
      unmatched.push(playerName);
    }
  }

  return { matches, unmatched };
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  unmatched: string[];
  error?: string;
}

/**
 * Import TTFL historical picks from TSV data.
 *
 * @param tsvData - Tab-separated data from TTFL website
 * @returns Import result with success status and statistics
 */
export async function importTTFLPicks(tsvData: string): Promise<ImportResult> {
  try {
    // Parse TSV data
    const parsedData = parseTTFLData(tsvData);

    if (parsedData.length === 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        unmatched: [],
        error: 'No valid data found. Please paste tab-separated data from the TTFL website.',
      };
    }

    // Fetch all players from API
    const allPlayers = await getAllPlayers();

    // Match player names to IDs
    const { matches, unmatched } = matchPlayerNames(parsedData, allPlayers);

    if (matches.length === 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        unmatched,
        error: 'No players could be matched. Please check the data format.',
      };
    }

    // Import picks (this will be done in the component to avoid circular dependency)
    return {
      success: true,
      imported: matches.length,
      skipped: parsedData.length - matches.length,
      unmatched,
    };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      unmatched: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validate and parse TTFL data, then match to player IDs.
 * This version returns the matched picks for importing.
 */
export async function parseAndMatchTTFLData(tsvData: string): Promise<{
  picks: Pick[];
  unmatched: string[];
  error?: string;
}> {
  try {
    // Parse TSV data
    const parsedData = parseTTFLData(tsvData);

    if (parsedData.length === 0) {
      return {
        picks: [],
        unmatched: [],
        error: 'No valid data found. Please paste tab-separated data from the TTFL website.',
      };
    }

    // Fetch all players from API
    const allPlayers = await getAllPlayers();

    // Match player names to IDs
    const { matches, unmatched } = matchPlayerNames(parsedData, allPlayers);

    if (matches.length === 0) {
      return {
        picks: [],
        unmatched,
        error: 'No players could be matched. Please check the data format.',
      };
    }

    return {
      picks: matches,
      unmatched,
    };
  } catch (error) {
    return {
      picks: [],
      unmatched: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
