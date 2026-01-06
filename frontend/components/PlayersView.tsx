"use client";

import { AlertCircle, Calendar } from "lucide-react";
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
import { getTonightsPlayers, Player } from "@/lib/api";
import {
  getDaysUntilEligible,
  getLastPickedDate,
  getPickForDate,
  removePick,
  savePick,
} from "@/lib/picks";

function FiltersSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Filter badges skeleton */}
      <div className="flex gap-2 pb-1 sm:pb-0">
        <Skeleton className="h-6 w-24 rounded-full bg-blue-200/50" />
        <Skeleton className="h-6 w-16 rounded-full bg-blue-200/50" />
        <Skeleton className="h-6 w-20 rounded-full bg-blue-200/50" />
      </div>

      {/* Sort dropdown skeleton */}
      <Skeleton className="h-9 w-full sm:w-44 rounded-md bg-blue-200/50" />
    </div>
  );
}

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
  initialPlayers: Player[];
  initialDate: string;
}

/**
 * Client component that handles player list interactivity:
 * - Filtering and sorting
 * - Pick management (localStorage)
 * - Date navigation (re-fetches on date change)
 */
export default function PlayersView({
  initialPlayers,
  initialDate,
}: PlayersViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Date from URL or server-provided initialDate (avoids hydration mismatch)
  const dateParam = searchParams?.get("date");
  const currentDate = dateParam || initialDate;

  // Player data state
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialDateLoaded, setInitialDateLoaded] = useState(initialDate);

  // Filter/sort state
  const [sortBy, setSortBy] = useState<SortOption>("avg-desc");
  const [filterBy, setFilterBy] = useState<FilterOption>("available");

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

  // Add eligibility info from localStorage
  // currentPick triggers recalc when user picks/unpicks a player
  const playersWithEligibility = useMemo(() => {
    return players.map((player) => {
      if (!isHydrated) {
        return {
          ...player,
          is_eligible: true,
          last_picked_date: null,
          days_until_eligible: null,
        };
      }
      const lastPickedDate = getLastPickedDate(player.player_id, currentDate);
      return {
        ...player,
        is_eligible: !lastPickedDate,
        last_picked_date: lastPickedDate,
        days_until_eligible: getDaysUntilEligible(
          player.player_id,
          currentDate
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, currentDate, isHydrated, currentPick]);

  // Fetch players for a date
  const loadPlayers = useCallback(async (date: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTonightsPlayers(date);
      setPlayers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle date changes and validation
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

    if (currentDate !== initialDateLoaded) {
      loadPlayers(currentDate);
      setInitialDateLoaded(currentDate);
    }
  }, [
    currentDate,
    dateParam,
    router,
    initialDate,
    initialDateLoaded,
    loadPlayers,
  ]);

  // Filter and sort players
  const filteredPlayers = useMemo(() => {
    let filtered = [...playersWithEligibility];

    if (filterBy === "available") {
      filtered = filtered.filter((p) => p.is_eligible);
    } else if (filterBy === "locked") {
      filtered = filtered.filter((p) => !p.is_eligible);
    }

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
  }, [playersWithEligibility, sortBy, filterBy]);

  const availableCount = isHydrated
    ? playersWithEligibility.filter((p) => p.is_eligible).length
    : null;

  const lockedCount = isHydrated
    ? playersWithEligibility.filter((p) => !p.is_eligible).length
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-xl font-bold tracking-tight">
            Pick Dashboard
          </h1>
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
              onClick={() => loadPlayers(currentDate)}
              size="lg"
              className="shadow-md"
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!error && players.length === 0 && (
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
      />

      {/* Players list */}
      {!error && players.length > 0 && (
        <>
          {!isHydrated ? (
            <>
              <TableSkeleton />
            </>
          ) : (
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
                  loading={loading}
                  onPickPlayer={handlePickPlayer}
                  onRemovePick={handleRemovePick}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
