"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { PlayerInfo } from "@/components/PlayerInfo";
import { TeamLogo } from "@/components/TeamLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Player } from "@/lib/api";

const LOGO_SIZE = 32;
function RankTrend({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0)
    return <span className="text-xs text-muted-foreground/40">—</span>;

  const rising = delta > 0;
  return (
    <span
      title={`${rising ? "+" : ""}${delta} rank vs last week`}
      className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${rising ? "text-green-500" : "text-red-500"}`}
    >
      {rising ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function formatInjuryDetails(details: string) {
  // Split by the words we want to bold, keeping the delimiters
  const parts = details.split(/\b(questionable|probable)\b/gi);

  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (lower === "questionable" || lower === "probable") {
      return (
        <strong key={i} className="font-bold">
          {part}
        </strong>
      );
    }
    return part;
  });
}

function InjuryBadge({
  status,
  returnDate,
  details,
}: {
  status: string | null;
  returnDate: string | null;
  details: string | null;
}) {
  const [open, setOpen] = useState(false);

  if (!status || status.toLowerCase() === "available") return null;

  const isOut = status.toLowerCase() === "out";
  const label = isOut ? "OUT" : "GTD";
  const variant = isOut ? "destructive" : "warning";
  const hasDetails = returnDate || details;

  if (!hasDetails) {
    return (
      <Badge variant={variant} className="px-1.5 py-0.5 text-[11px] leading-4">
        {label}
      </Badge>
    );
  }

  const isTouch = typeof window !== "undefined" && "ontouchstart" in window;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="focus:outline-none"
          onClick={(e) => {
            e.stopPropagation();
            if (isTouch) e.currentTarget.blur();
          }}
          onMouseEnter={() => !isTouch && setOpen(true)}
          onMouseLeave={() => !isTouch && setOpen(false)}
        >
          <Badge
            variant={variant}
            className="px-1.5 py-0.5 text-[11px] leading-4 cursor-pointer"
          >
            {label}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-70 max-w-[90vw] px-3 py-2.5 cursor-pointer"
        sideOffset={4}
        onClick={() => setOpen(false)}
        onMouseEnter={() => !isTouch && setOpen(true)}
        onMouseLeave={() => !isTouch && setOpen(false)}
      >
        {!isOut && (
          <div className="last:mb-0">
            <p className="font-semibold text-sm leading-relaxed">{status}</p>
          </div>
        )}
        {returnDate && (
          <div className="mb-2 last:mb-0">
            <p className="font-semibold text-sm leading-relaxed">
              Expected return: {returnDate}
            </p>
          </div>
        )}
        {details && (
          <div className="text-xs text-muted-foreground leading-relaxed wrap-break-word">
            Details: {formatInjuryDetails(details)}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface PlayerWithEligibility extends Player {
  is_eligible: boolean;
  last_picked_date: string | null;
  days_until_eligible: number | null;
  is_back_to_back: boolean;
  rank_delta: number | null;
  avg_ttfl_week_ago: number;
  avg_ttfl_playoffs: number | null;
  avg_ttfl_current_round: number | null;
  avg_ttfl_last_round: number | null;
}

interface StatRange {
  min: number;
  max: number;
  median: number;
}

interface StatRanges {
  pace: StatRange;
  defRating: StatRange;
}

interface PlayersTableProps {
  players: PlayerWithEligibility[];
  currentPick: number | null;
  isHydrated: boolean;
  loading: boolean;
  statRanges: StatRanges;
  onPickPlayer: (playerId: number) => void;
  onRemovePick: () => void;
  isPlayoffPeriod?: boolean;
  currentPlayoffRound?: number | null;
  lastPlayoffRound?: number | null;
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

export default function PlayersTable({
  players,
  currentPick,
  isHydrated,
  loading,
  statRanges,
  onPickPlayer,
  onRemovePick,
  isPlayoffPeriod = false,
  currentPlayoffRound = null,
  lastPlayoffRound = null,
}: PlayersTableProps) {
  return (
    <div className="relative animate-fade-in">
      {loading && (
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-lg">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Table Layout */}
      <div className="overflow-x-auto overflow-y-hidden border rounded-lg scrollbar-hide">
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
                colSpan={4}
              >
                TTFL
              </th>
              {isPlayoffPeriod && (
                <th
                  className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-amber-500 border-l-[3px] border-amber-400/50"
                  colSpan={3}
                >
                  Playoffs
                </th>
              )}
              <th></th>
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
              <th className="px-3 py-2 text-right font-medium">-14d</th>
              <th className="px-3 py-2 text-right font-medium">L10</th>
              <th className="px-3 py-2 text-right font-medium">30d</th>
              {isPlayoffPeriod && (
                <>
                  <th className="px-3 py-2 text-right font-medium border-l-[3px] border-amber-400/50">
                    All
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {lastPlayoffRound ? `Rnd ${lastPlayoffRound}` : "—"}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    {currentPlayoffRound ? `Rnd ${currentPlayoffRound}` : "—"}
                  </th>
                </>
              )}
              <th className="w-8 px-2 py-2"></th>
              <th className="w-14 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {players.map((player) => {
              const isIneligible = isHydrated && !player.is_eligible;
              return (
                <tr
                  key={player.player_id}
                  className="hover:bg-muted/50 transition-colors leading-tight sm:leading-normal"
                >
                  <td className="w-10 pl-2 sm:pl-3 pr-1 sm:pr-2 py-0.5 sm:py-1">
                    <InjuryBadge
                      status={player.injury_status}
                      returnDate={player.injury_return_date}
                      details={player.injury_details}
                    />
                  </td>
                  <td
                    className={`whitespace-nowrap pr-2 py-0.5 sm:py-1 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between sm:pr-2">
                      <PlayerInfo
                        playerId={player.player_id}
                        name={player.name}
                        team={player.team}
                        logoSize={LOGO_SIZE}
                      />
                      {player.is_back_to_back && (
                        <span
                          title="Back-to-back"
                          className="text-xs font-semibold text-muted-foreground/70 px-1.5 py-0.5 rounded border border-border bg-muted/50"
                        >
                          B2B
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-0.5 sm:py-1 text-muted-foreground border-l-[3px] border-red-400/50 bg-red-500/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {player.is_home ? "vs" : "@"}
                      <TeamLogo team={player.opponent} size={LOGO_SIZE} />
                    </span>
                  </td>
                  <td
                    className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-red-500/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
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
                    className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-red-500/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                    style={{
                      backgroundColor: getStatBgColor(
                        player.opp_def_rating,
                        statRanges.defRating
                      ),
                    }}
                  >
                    {player.opp_def_rating?.toFixed(1) ?? "-"}
                  </td>
                  <td
                    className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums border-l-[3px] border-primary/50 bg-primary/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    {player.avg_ttfl.toFixed(1)}
                  </td>
                  <td
                    className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-primary/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    {player.avg_ttfl_week_ago > 0
                      ? player.avg_ttfl_week_ago.toFixed(1)
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-0.5 sm:py-1 text-right font-semibold tabular-nums bg-primary/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    {player.avg_ttfl_l10.toFixed(1)}
                  </td>
                  <td
                    className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-primary/3 ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
                    {player.avg_ttfl_l30d.toFixed(1)}
                  </td>
                  {isPlayoffPeriod && (
                    <>
                      <td
                        className={`px-3 py-0.5 sm:py-1 text-right font-semibold tabular-nums border-l-[3px] border-amber-400/50 bg-amber-500/3 ${
                          isIneligible ? "opacity-50" : ""
                        }`}
                      >
                        {player.avg_ttfl_playoffs != null
                          ? player.avg_ttfl_playoffs.toFixed(1)
                          : "—"}
                      </td>
                      <td
                        className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-amber-500/3 ${
                          isIneligible ? "opacity-50" : ""
                        }`}
                      >
                        {player.avg_ttfl_last_round != null
                          ? player.avg_ttfl_last_round.toFixed(1)
                          : "—"}
                      </td>
                      <td
                        className={`px-3 py-0.5 sm:py-1 text-right text-muted-foreground tabular-nums bg-amber-500/3 ${
                          isIneligible ? "opacity-50" : ""
                        }`}
                      >
                        {player.avg_ttfl_current_round != null
                          ? player.avg_ttfl_current_round.toFixed(1)
                          : "—"}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-0.5 sm:py-1 text-center">
                    <RankTrend delta={player.rank_delta} />
                  </td>
                  <td
                    className={`px-2 py-0.5 sm:py-1 text-right ${
                      isIneligible ? "opacity-50" : ""
                    }`}
                  >
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
                      <span className="inline-flex items-center justify-center h-6 text-xs text-muted-foreground tabular-nums">
                        {player.days_until_eligible}d
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
