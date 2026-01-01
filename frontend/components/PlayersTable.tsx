"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Player } from "@/lib/api";
import { FilterOption } from "@/components/PlayerFilters";

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
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30 text-xs">
            <tr>
              <th className={`w-8 px-2 py-2 ${hideEligibilityOnMobile ? "hidden sm:table-cell" : ""}`}></th>
              <th className={`whitespace-nowrap pr-2 py-2 text-left font-medium ${hideEligibilityOnMobile ? "pl-2 sm:pl-0" : "pl-0"}`}>
                Player
              </th>
              <th className="px-3 py-2 text-left font-medium border-l-2 border-red-300/30">
                Opp
              </th>
              <th className="px-3 py-2 text-right font-medium">Pace</th>
              <th className="px-3 py-2 text-right font-medium border-r-2 border-red-300/30">DRtg</th>
              <th className="px-3 py-2 text-right font-medium">
                Avg
              </th>
              <th className="px-3 py-2 text-right font-medium">L10</th>
              <th className="px-3 py-2 text-right font-medium">30d</th>
              <th className="w-14 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {players.map((player) => (
              <tr key={player.player_id} className="hover:bg-muted">
                <td className={`w-8 px-2 py-1.5 ${hideEligibilityOnMobile ? "hidden sm:table-cell" : ""}`}>
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
                <td className={`whitespace-nowrap pr-2 py-1.5 ${hideEligibilityOnMobile ? "pl-2 sm:pl-0" : "pl-0"}`}>
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
                <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground border-l-2 border-red-300/30">
                  {player.is_home ? "vs" : "@"} {player.opponent}
                </td>
                <td
                  className="px-3 py-1.5 text-right text-muted-foreground tabular-nums"
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
                  className="px-3 py-1.5 text-right text-muted-foreground tabular-nums border-r-2 border-red-300/30"
                  style={{
                    backgroundColor: getStatBgColor(
                      player.opp_def_rating,
                      statRanges.defRating
                    ),
                  }}
                >
                  {player.opp_def_rating?.toFixed(1) ?? "-"}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {player.avg_ttfl.toFixed(1)}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold">
                  {player.avg_ttfl_l10.toFixed(1)}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {player.avg_ttfl_l30d.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-right">
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
    </div>
  );
}
