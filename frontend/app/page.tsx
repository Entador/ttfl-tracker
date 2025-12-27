"use client";

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
import { AlertCircle, Calendar, CircleDot, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("avg-desc");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [currentPick, setCurrentPick] = useState<number | null>(null); // player_id picked for current date

  // Get date from URL or default to today
  const dateParam = searchParams.get("date");
  const today = new Date().toISOString().split("T")[0];
  const [currentDate, setCurrentDate] = useState<string>(today);

  // Validate date parameter from URL
  useEffect(() => {
    if (!dateParam) {
      setCurrentDate(today);
      return;
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateParam)) {
      console.warn("Invalid date format, using today");
      router.replace("/");
      return;
    }

    // Validate date is within range (±30 days)
    const selectedDate = new Date(dateParam);
    const todayDate = new Date(today);
    const daysDiff = Math.floor(
      (selectedDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff < -30 || daysDiff > 30) {
      console.warn("Date out of range (±30 days), using today");
      router.replace("/");
      return;
    }

    setCurrentDate(dateParam);
  }, [dateParam, router, today]);

  const loadPlayers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTonightsPlayers(currentDate);
      setPlayers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load players");
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  // Load players when date changes
  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // Load current pick from localStorage when date changes
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

  // Add eligibility info to players (calculated from localStorage)
  const playersWithEligibility = useMemo(() => {
    return players.map((p) => ({
      ...p,
      is_eligible: !getLastPickedDate(p.player_id, currentDate),
      last_picked_date: getLastPickedDate(p.player_id, currentDate),
      days_until_eligible: getDaysUntilEligible(p.player_id, currentDate),
    }));
  }, [players, currentDate, currentPick]); // re-compute when pick changes

  // Filter and sort players
  const filteredAndSortedPlayers = useMemo(() => {
    let filtered = [...playersWithEligibility];

    // Apply filter
    if (filterBy === "available") {
      filtered = filtered.filter((p) => p.is_eligible);
    } else if (filterBy === "locked") {
      filtered = filtered.filter((p) => !p.is_eligible);
    }

    // Apply sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "avg-desc":
          // Available players first, then by TTFL score (L10)
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
      {/* Page header - Always visible */}
      <div className="animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CircleDot className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              {currentDate === today ? "Tonight's Players" : "Players"}
            </h1>
          </div>
          <DateNavigation currentDate={currentDate} />
        </div>
        {!loading && !error && players.length > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{players.length} playing</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success"></span>
              {availableCount} eligible
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-destructive"></span>
              {lockedCount} locked
            </span>
          </div>
        )}
      </div>

      {/* Content - Conditional based on state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
            <Loader2 className="h-20 w-20 animate-spin text-primary" />
          </div>
          <p className="text-lg font-semibold mt-8 text-foreground">
            Loading {currentDate === today ? "tonight's" : ""} players
          </p>
          <p className="text-sm text-muted-foreground mt-2 animate-pulse-subtle">
            Fetching the latest data...
          </p>
        </div>
      )}

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
            <Button onClick={loadPlayers} size="lg" className="shadow-md">
              Try Again
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && players.length === 0 && (
        <Card className="animate-slide-up">
          <CardContent className="flex flex-col items-center py-16">
            <div className="p-4 rounded-full bg-muted/50 mb-6">
              <Calendar className="h-16 w-16 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No games scheduled</h3>
            <p className="text-muted-foreground text-center max-w-md">
              {currentDate === today
                ? "Check back later for tonight's games"
                : "No games scheduled for this date"}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && players.length > 0 && (
        <>
          {/* Filters and sorting */}
          <PlayerFilters
            sortBy={sortBy}
            onSortChange={setSortBy}
            filterBy={filterBy}
            onFilterChange={setFilterBy}
            totalCount={players.length}
            availableCount={availableCount}
            lockedCount={lockedCount}
          />

          {/* Player table */}
          {filteredAndSortedPlayers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No players match filters
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/30">
                      <tr>
                        <th className="w-8 px-3 py-3"></th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                          Player
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                          Matchup
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                          Season
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                          L10
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider">
                          L30D
                        </th>
                        <th className="w-24 px-3 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredAndSortedPlayers.map((player) => (
                        <tr
                          key={player.player_id}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-3 py-3">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                player.is_eligible
                                  ? "bg-success"
                                  : "bg-destructive"
                              }`}
                              title={
                                player.is_eligible
                                  ? "Eligible"
                                  : `Locked until ${player.last_picked_date}`
                              }
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/players/${player.player_id}`}
                              className="hover:underline"
                            >
                              <div className="font-medium">{player.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {player.team}
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-sm">
                            {player.is_home ? (
                              <span>vs {player.opponent}</span>
                            ) : (
                              <span className="text-muted-foreground">
                                @ {player.opponent}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-medium text-muted-foreground">
                              {player.avg_ttfl.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-semibold text-lg">
                              {player.avg_ttfl_l10.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="font-medium text-muted-foreground">
                              {player.avg_ttfl_l30d.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {currentPick === player.player_id ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleRemovePick}
                              >
                                Picked
                              </Button>
                            ) : player.is_eligible ? (
                              <Button
                                size="sm"
                                onClick={() => handlePickPlayer(player)}
                              >
                                Pick
                              </Button>
                            ) : (
                              <span className="inline-block px-2 py-1 text-xs font-medium text-gray-700 bg-gray-200 rounded-full">
                                {player.days_until_eligible}d
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
            <Loader2 className="h-20 w-20 animate-spin text-primary" />
          </div>
          <p className="text-lg font-semibold mt-8 text-foreground">
            Loading players
          </p>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
