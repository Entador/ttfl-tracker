"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Calendar, CircleDot, Loader2 } from "lucide-react";

import DateNavigation from "@/components/DateNavigation";
import PlayerFilters, {
  FilterOption,
  SortOption,
} from "@/components/PlayerFilters";
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
 * Client component that handles all player list interactivity:
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

  // Date from URL or use server-provided initialDate to avoid hydration mismatch
  // (new Date() can differ between server and client due to timezones)
  const dateParam = searchParams.get("date");
  const currentDate = dateParam || initialDate;

  // State
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("avg-desc");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [currentPick, setCurrentPick] = useState<number | null>(null);

  // Track hydration - localStorage unavailable on server, so defer eligibility calc
  const [isHydrated, setIsHydrated] = useState(false);

  // Track if we've loaded initial data (to avoid re-fetch on first render)
  const [initialDateLoaded, setInitialDateLoaded] = useState(initialDate);

  // Mark as hydrated after mount (client-side only)
  useEffect(() => {
    setIsHydrated(true);
  }, []);

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

  // Validate and handle date changes
  useEffect(() => {
    // Validate date format
    if (dateParam) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateParam)) {
        console.warn("Invalid date format, redirecting to today");
        router.replace("/");
        return;
      }

      // Validate date range (±30 days from initialDate)
      const selectedDate = new Date(dateParam);
      const baseDate = new Date(initialDate);
      const daysDiff = Math.floor(
        (selectedDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff < -30 || daysDiff > 30) {
        console.warn("Date out of range (±30 days), redirecting to today");
        router.replace("/");
        return;
      }
    }

    // Re-fetch if date changed from initially loaded date
    if (currentDate !== initialDateLoaded) {
      loadPlayers(currentDate);
      setInitialDateLoaded(currentDate);
    }
  }, [currentDate, dateParam, router, initialDate, initialDateLoaded, loadPlayers]);

  // Load pick from localStorage when date changes
  useEffect(() => {
    const pick = getPickForDate(currentDate);
    setCurrentPick(pick?.playerId || null);
  }, [currentDate]);

  function handlePickPlayer(player: Player) {
    savePick(player.player_id, currentDate);
    setCurrentPick(player.player_id);
  }

  function handleRemovePick() {
    removePick(currentDate);
    setCurrentPick(null);
  }

  // Add eligibility info (calculated from localStorage after hydration)
  // Only calculate after hydration since localStorage isn't available on server
  const playersWithEligibility = useMemo(() => {
    return players.map((p) => ({
      ...p,
      is_eligible: !getLastPickedDate(p.player_id, currentDate),
      last_picked_date: getLastPickedDate(p.player_id, currentDate),
      days_until_eligible: getDaysUntilEligible(p.player_id, currentDate),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, currentDate, currentPick]);

  // Filter and sort
  const filteredAndSortedPlayers = useMemo(() => {
    let filtered = [...playersWithEligibility];

    if (filterBy === "available") {
      filtered = filtered.filter((p) => p.is_eligible);
    } else if (filterBy === "locked") {
      filtered = filtered.filter((p) => !p.is_eligible);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "avg-desc":
          if (a.is_eligible !== b.is_eligible) {
            return a.is_eligible ? -1 : 1;
          }
          return b.avg_ttfl_l10 - a.avg_ttfl_l10;
        case "avg-asc":
          if (a.is_eligible !== b.is_eligible) {
            return a.is_eligible ? -1 : 1;
          }
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

  const availableCount = playersWithEligibility.filter(
    (p) => p.is_eligible
  ).length;
  const lockedCount = playersWithEligibility.length - availableCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CircleDot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">
            {currentDate === initialDate ? "Tonight's Players" : "Players"}
          </h1>
        </div>
        <DateNavigation currentDate={currentDate} />
      </div>

      {/* Loading state - shown during fetch OR before hydration (localStorage not ready) */}
      {(loading || !isHydrated) && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
            <Loader2 className="h-20 w-20 animate-spin text-primary" />
          </div>
          <p className="text-lg font-semibold mt-8 text-foreground">
            Loading players
          </p>
          <p className="text-sm text-muted-foreground mt-2 animate-pulse-subtle">
            Fetching the latest data...
          </p>
        </div>
      )}

      {/* Error state */}
      {isHydrated && error && (
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
      {isHydrated && !loading && !error && players.length === 0 && (
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

      {/* Players table */}
      {isHydrated && !loading && !error && players.length > 0 && (
        <>
          <PlayerFilters
            sortBy={sortBy}
            onSortChange={setSortBy}
            filterBy={filterBy}
            onFilterChange={setFilterBy}
            totalCount={players.length}
            availableCount={availableCount}
            lockedCount={lockedCount}
          />

          {filteredAndSortedPlayers.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              No players match filters
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 text-xs">
                  <tr>
                    <th className="w-6 px-2 py-2"></th>
                    <th className="px-2 py-2 text-left font-medium">Player</th>
                    <th className="px-2 py-2 text-left font-medium">Match</th>
                    <th className="px-2 py-2 text-right font-medium">Avg</th>
                    <th className="px-2 py-2 text-right font-medium">L10</th>
                    <th className="px-2 py-2 text-right font-medium">30d</th>
                    <th className="w-16 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAndSortedPlayers.map((player) => (
                    <tr
                      key={player.player_id}
                      className="hover:bg-muted/20"
                    >
                      <td className="px-2 py-1.5">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            player.is_eligible ? "bg-success" : "bg-destructive"
                          }`}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/players/${player.player_id}`}
                          className="hover:underline"
                        >
                          <span className="font-medium">{player.name}</span>
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {player.team}
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {player.is_home ? "vs" : "@"} {player.opponent}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {player.avg_ttfl.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        {player.avg_ttfl_l10.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {player.avg_ttfl_l30d.toFixed(1)}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {currentPick === player.player_id ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-xs"
                            onClick={handleRemovePick}
                          >
                            ✓
                          </Button>
                        ) : player.is_eligible ? (
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => handlePickPlayer(player)}
                          >
                            Pick
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {player.days_until_eligible}d
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
