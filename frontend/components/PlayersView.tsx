"use client";

import { AlertCircle, Calendar } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import DateNavigation from "@/components/DateNavigation";
import PlayerFilters, {
  FilterOption,
  SortOption,
} from "@/components/PlayerFilters";
import PlayersTable from "@/components/PlayersTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getSnapshot, SnapshotData } from "@/lib/api";
import { getAllPicks, getPickForDate, removePick, savePick } from "@/lib/picks";
import { getGamesForDate, getPlayersForDate } from "@/lib/snapshot";

function TableSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-xs">
          {/* Group headers row */}
          <tr className="bg-muted/40">
            <th></th>
            <th className="border-transparent border-0"></th>
            <th
              className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-red-500 border-l-[3px] border-red-400/50"
              colSpan={3}
            >
              Opponent
            </th>
            <th
              className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-primary border-l-[3px] border-primary/50"
              colSpan={3}
            >
              TTFL
            </th>
            <th></th>
          </tr>
          {/* Column headers row */}
          <tr className="border-b bg-muted/20">
            <th className="w-10 px-1 py-2"></th>
            <th className="whitespace-nowrap pr-2 py-2 text-left font-medium">
              Player
            </th>
            <th className="px-3 py-2 text-left font-medium border-l-[3px] border-red-400/50">
              Matchup
            </th>
            <th className="px-3 py-2 text-right font-medium">Pace</th>
            <th className="px-3 py-2 text-right font-medium">DRtg</th>
            <th className="px-3 py-2 text-right font-medium border-l-[3px] border-primary/50">
              Season
            </th>
            <th className="px-3 py-2 text-right font-medium">L10</th>
            <th className="px-3 py-2 text-right font-medium">30d</th>
            <th className="w-14 px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>
              <td className="w-10 pl-3 pr-2 py-2"></td>
              <td className="whitespace-nowrap pr-2 py-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full bg-blue-200/50" />
                  <Skeleton className="h-4 w-32 bg-blue-200/50" />
                </div>
              </td>
              <td className="px-3 py-3 border-l-[3px] border-red-400/50 bg-red-500/3">
                <Skeleton className="h-4 w-12 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-3 py-3 bg-red-500/3">
                <Skeleton className="h-4 w-10 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-3 py-3 bg-red-500/3">
                <Skeleton className="h-4 w-10 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-3 py-3 border-l-[3px] border-primary/50 bg-primary/3">
                <Skeleton className="h-4 w-10 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-3 py-3 bg-primary/3">
                <Skeleton className="h-4 w-10 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-3 py-3 bg-primary/3">
                <Skeleton className="h-4 w-10 ml-auto bg-blue-200/50" />
              </td>
              <td className="px-2 py-3">
                <Skeleton className="h-6 w-12 ml-auto rounded bg-blue-200/50" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PlayersViewProps {
  initialDate: string;
}

/**
 * Client component that handles player list interactivity:
 * - Fetches entire season snapshot once
 * - Filters by date client-side (instant navigation)
 * - Filtering and sorting
 * - Pick management (localStorage)
 */
export default function PlayersView({ initialDate }: PlayersViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date from URL or server-provided initialDate (avoids hydration mismatch)
  const dateParam = searchParams?.get("date");
  const currentDate = dateParam || initialDate;

  // Snapshot data state (fetched once on mount)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter/sort state
  const [sortBy, setSortBy] = useState<SortOption>("avg-desc");
  const [filterBy, setFilterBy] = useState<FilterOption>("available");
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  // Hydration + pick state (localStorage not available on server)
  const [isHydrated, setIsHydrated] = useState(false);
  const [currentPick, setCurrentPick] = useState<number | null>(null);

  // Mark hydrated after mount
  useEffect(() => setIsHydrated(true), []);

  // Load pick from localStorage when date changes
  useEffect(() => {
    if (!isHydrated) return;
    const pick = getPickForDate(currentDate);
    setCurrentPick(pick?.playerId ?? null);
  }, [currentDate, isHydrated]);

  // Pick handlers
  const handlePickPlayer = useCallback(
    (playerId: number) => {
      savePick(playerId, currentDate);
      setCurrentPick(playerId);
    },
    [currentDate]
  );

  const handleRemovePick = useCallback(() => {
    removePick(currentDate);
    setCurrentPick(null);
  }, [currentDate]);

  // Fetch snapshot once on mount
  useEffect(() => {
    const loadSnapshot = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSnapshot();
        setSnapshot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    loadSnapshot();
  }, []);

  // Handle date validation (but no refetch - just validation)
  useEffect(() => {
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        router.replace("/");
        return;
      }
      const daysDiff = Math.floor(
        (new Date(dateParam).getTime() - new Date(initialDate).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (daysDiff < -30 || daysDiff > 30) {
        router.replace("/");
        return;
      }
    }
  }, [currentDate, dateParam, router, initialDate]);

  // Filter players for current date from snapshot
  const players = useMemo(() => {
    if (!snapshot) return [];
    return getPlayersForDate(snapshot, currentDate);
  }, [snapshot, currentDate]);

  // Get games for current date
  const games = useMemo(() => {
    if (!snapshot) return [];
    return getGamesForDate(snapshot, currentDate);
  }, [snapshot, currentDate]);

  // Add eligibility info from localStorage
  // currentPick triggers recalc when user picks/unpicks a player
  const playersWithEligibility = useMemo(() => {
    if (!isHydrated) {
      return players.map((player) => ({
        ...player,
        is_eligible: true,
        last_picked_date: null,
        days_until_eligible: null,
      }));
    }

    // Read localStorage once and build lookup map for performance
    const allPicks = getAllPicks();
    const from = new Date(currentDate);

    // Build map of playerId -> last pick date within 30-day window
    const eligibilityMap = new Map<
      number,
      { lastPickedDate: string; daysUntilEligible: number }
    >();

    allPicks.forEach((pick) => {
      const pickDate = new Date(pick.date);
      const diffDays = Math.floor(
        (from.getTime() - pickDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Pick counts if it was 1-29 days ago (within 30-day window, but NOT same day)
      if (diffDays > 0 && diffDays < 30) {
        const existing = eligibilityMap.get(pick.playerId);
        // Keep the most recent pick
        if (!existing || pick.date > existing.lastPickedDate) {
          eligibilityMap.set(pick.playerId, {
            lastPickedDate: pick.date,
            daysUntilEligible: 30 - diffDays,
          });
        }
      }
    });

    return players.map((player) => {
      const eligibility = eligibilityMap.get(player.player_id);
      return {
        ...player,
        is_eligible: !eligibility,
        last_picked_date: eligibility?.lastPickedDate || null,
        days_until_eligible: eligibility?.daysUntilEligible || null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, currentDate, isHydrated, currentPick]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let filtered = [...playersWithEligibility];

    // Filter by eligibility
    if (filterBy === "available") {
      filtered = filtered.filter((p) => p.is_eligible);
    } else if (filterBy === "locked") {
      filtered = filtered.filter((p) => !p.is_eligible);
    }

    // Filter by selected game
    if (selectedGame) {
      filtered = filtered.filter((player) => {
        // Match against away_team-home_team format from backend
        const gameKey = player.is_home
          ? `${player.opponent}-${player.team}`
          : `${player.team}-${player.opponent}`;
        return gameKey === selectedGame;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "avg-desc":
          return b.avg_ttfl_l10 - a.avg_ttfl_l10;
        case "avg-asc":
          return a.avg_ttfl_l10 - b.avg_ttfl_l10;
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [playersWithEligibility, sortBy, filterBy, selectedGame]);

  const availableCount = isHydrated
    ? playersWithEligibility.filter((p) => p.is_eligible).length
    : null;

  const lockedCount = isHydrated
    ? playersWithEligibility.filter((p) => !p.is_eligible).length
    : null;

  // Convert backend games to frontend format
  const gamesForFilter = useMemo(() => {
    return games.map((game) => {
      const key = `${game.away_team}-${game.home_team}`;
      return {
        key,
        awayTeam: game.away_team,
        homeTeam: game.home_team,
        label: `${game.away_team} @ ${game.home_team}`,
      };
    });
  }, [games]);

  const gamesCount = games.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center sm:gap-5 gap-3">
          <h1 className="text-xs sm:text-xs font-bold tracking-tight">
            Pick Dashboard
          </h1>
          {(loading || !isHydrated) && (
            <Image
              src="/fail.gif"
              alt="Loading..."
              width={60}
              height={60}
              unoptimized
              className="w-8 h-8 sm:w-15 sm:h-15"
            />
          )}
        </div>
        <DateNavigation currentDate={currentDate} />
      </div>

      {/* Error state */}
      {error && (
        <Card className="border-destructive/50 shadow-lg animate-slide-up">
          <CardContent className="flex flex-col items-center py-16">
            <div className="p-4 rounded-full bg-destructive/10 mb-6">
              <AlertCircle className="h-16 w-16 text-destructive" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Error loading players</h3>
            <p className="text-muted-foreground mb-6 text-center max-w-md">
              {error}
            </p>
            <Button
              onClick={() => window.location.reload()}
              size="lg"
              className="shadow-md"
            >
              Reload Page
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state - only show after loading completes */}
      {!error && !loading && players.length === 0 && (
        <Card className="animate-slide-up">
          <CardContent className="flex flex-col items-center py-16">
            <div className="p-4 rounded-full bg-muted/50 mb-6">
              <Calendar className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No games scheduled</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {currentDate === initialDate
                ? "Check back later for tonight's games"
                : "No games scheduled for this date"}
            </p>
          </CardContent>
        </Card>
      )}

      <PlayerFilters
        sortBy={sortBy}
        onSortChange={setSortBy}
        filterBy={filterBy}
        onFilterChange={setFilterBy}
        totalCount={players.length ?? null}
        availableCount={availableCount}
        lockedCount={lockedCount}
        gamesCount={players.length > 0 ? gamesCount : null}
        games={gamesForFilter}
        selectedGame={selectedGame}
        onGameChange={setSelectedGame}
      />

      {/* Players list */}
      {!error && (
        <>
          {loading || !isHydrated ? (
            <TableSkeleton />
          ) : players.length > 0 ? (
            <>
              {filteredPlayers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No players match filters
                </p>
              ) : (
                <PlayersTable
                  players={filteredPlayers}
                  currentPick={currentPick}
                  isHydrated={isHydrated}
                  loading={false}
                  onPickPlayer={handlePickPlayer}
                  onRemovePick={handleRemovePick}
                />
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
