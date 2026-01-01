"use client";

import { AlertCircle, Calendar, CircleDot } from "lucide-react";
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
import { getTonightsPlayers, Player } from "@/lib/api";
import {
  getDaysUntilEligible,
  getLastPickedDate,
  getPickForDate,
  removePick,
  savePick,
} from "@/lib/picks";

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
  const [filterBy, setFilterBy] = useState<FilterOption>("all");

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
        days_until_eligible: getDaysUntilEligible(player.player_id, currentDate),
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
  }, [currentDate, dateParam, router, initialDate, initialDateLoaded, loadPlayers]);

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

  const availableCount = playersWithEligibility.filter((p) => p.is_eligible).length;
  const lockedCount = playersWithEligibility.length - availableCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CircleDot className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Pick Dashboard</h1>
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

      {/* Players list */}
      {!error && players.length > 0 && (
        <>
          <PlayerFilters
            sortBy={sortBy}
            onSortChange={setSortBy}
            filterBy={filterBy}
            onFilterChange={setFilterBy}
            totalCount={players.length}
            availableCount={availableCount}
            lockedCount={lockedCount}
            isHydrated={isHydrated}
          />

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
              filterBy={filterBy}
              onPickPlayer={handlePickPlayer}
              onRemovePick={handleRemovePick}
            />
          )}
        </>
      )}
    </div>
  );
}
