"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { FilterOption } from "@/components/PlayerFilters";
import { Button } from "@/components/ui/button";
import { Player } from "@/lib/api";

export interface PlayerWithEligibility extends Player {
  is_eligible: boolean;
  last_picked_date: string | null;
  days_until_eligible: number | null;
}

interface StatRange {
  min: number;
  max: number;
  median: number;
}

interface PlayersTableProps {
  players: PlayerWithEligibility[];
  currentPick: number | null;
  isHydrated: boolean;
  loading: boolean;
  filterBy: FilterOption;
  onPickPlayer: (playerId: number) => void;
  onRemovePick: () => void;
}

/**
 * Get background color based on value position relative to median.
 * Higher is better (green), lower is worse (red), median is transparent.
 */
function getStatBgColor(value: number | null, stats: StatRange): string {
  if (value === null || stats.max === stats.min) return "transparent";

  const { min, max, median } = stats;

  if (value >= median) {
    const ratio = max === median ? 1 : (value - median) / (max - median);
    const alpha = Math.round(ratio * 0.4 * 100) / 100;
    return `rgba(34, 197, 94, ${alpha})`;
  } else {
    const ratio = median === min ? 1 : (median - value) / (median - min);
    const alpha = Math.round(ratio * 0.4 * 100) / 100;
    return `rgba(239, 68, 68, ${alpha})`;
  }
}

/**
 * Calculate stat ranges for color gradients.
 */
function useStatRanges(players: PlayerWithEligibility[]) {
  return useMemo(() => {
    const paces = players
      .map((p) => p.opp_pace)
      .filter((v): v is number => v !== null);
    const defRatings = players
      .map((p) => p.opp_def_rating)
      .filter((v): v is number => v !== null);

    const getStats = (values: number[]): StatRange => {
      if (values.length === 0) return { min: 0, max: 0, median: 0 };
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return { min: sorted[0], max: sorted[sorted.length - 1], median };
    };

    return {
      pace: getStats(paces),
      defRating: getStats(defRatings),
    };
  }, [players]);
}

export default function PlayersTable({
  players,
  currentPick,
  isHydrated,
  loading,
  filterBy,
  onPickPlayer,
  onRemovePick,
}: PlayersTableProps) {
  const statRanges = useStatRanges(players);
  const hideEligibilityOnMobile = filterBy === "available";

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Table Layout */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-xs">
            {/* Group headers row */}
            <tr className="bg-muted/40">
              <th
                className={`${
                  hideEligibilityOnMobile ? "hidden sm:table-cell" : ""
                }`}
              ></th>
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
              <th
                className={`w-8 px-2 py-2 ${
                  hideEligibilityOnMobile ? "hidden sm:table-cell" : ""
                }`}
              ></th>
              <th
                className={`whitespace-nowrap pr-2 py-2 text-left font-medium ${
                  hideEligibilityOnMobile ? "pl-2 sm:pl-0" : "pl-0"
                }`}
              >
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
            {players.map((player) => (
              <tr
                key={player.player_id}
                className="hover:bg-muted/50 transition-colors"
              >
                <td
                  className={`w-8 px-2 py-2 ${
                    hideEligibilityOnMobile ? "hidden sm:table-cell" : ""
                  }`}
                >
                  <div className="flex justify-center">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        !isHydrated
                          ? "bg-muted-foreground/30"
                          : player.is_eligible
                          ? "bg-success"
                          : "bg-destructive"
                      }`}
                    />
                  </div>
                </td>
                <td
                  className={`whitespace-nowrap pr-2 py-2 ${
                    hideEligibilityOnMobile ? "pl-2 sm:pl-0" : "pl-0"
                  }`}
                >
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
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground border-l-[3px] border-red-400/50 bg-red-500/3">
                  {player.is_home ? "vs" : "@"} {player.opponent}
                </td>
                <td
                  className="px-3 py-2 text-right text-muted-foreground tabular-nums bg-red-500/3"
                  style={{
                    backgroundColor: getStatBgColor(
                      player.opp_pace,
                      statRanges.pace
                    ),
                  }}
                >
                  {player.opp_pace?.toFixed(1) ?? "-"}
                </td>
                <td
                  className="px-3 py-2 text-right text-muted-foreground tabular-nums bg-red-500/3"
                  style={{
                    backgroundColor: getStatBgColor(
                      player.opp_def_rating,
                      statRanges.defRating
                    ),
                  }}
                >
                  {player.opp_def_rating?.toFixed(1) ?? "-"}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums border-l-[3px] border-primary/50 bg-primary/3">
                  {player.avg_ttfl.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums bg-primary/3">
                  {player.avg_ttfl_l10.toFixed(1)}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums bg-primary/3">
                  {player.avg_ttfl_l30d.toFixed(1)}
                </td>
                <td className="px-2 py-2 text-right">
                  {!isHydrated ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : currentPick === player.player_id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-xs"
                      onClick={onRemovePick}
                    >
                      ✓
                    </Button>
                  ) : player.is_eligible ? (
                    <Button
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onPickPlayer(player.player_id)}
                    >
                      Pick
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {player.days_until_eligible}d
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
