"use client";

import { useMemo, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Loader2 } from "lucide-react";

import { PlayerInfo } from "@/components/PlayerInfo";
import { getTodayET } from "@/lib/api";
import { useSnapshot } from "@/lib/hooks/useSnapshot";
import { getAllPicks } from "@/lib/picks";
import { PlayerSnapshot } from "@/lib/api";

const LOGO_SIZE = 28;
type SortKey = "rank" | "avg_ttfl_l10" | "avg_ttfl_l30d" | "name";

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

export default function RankingsView() {
  const { data: snapshot, isLoading } = useSnapshot();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("rank");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Build ranked player list with eligibility
  const rankedPlayers = useMemo(() => {
    if (!snapshot) return [];

    // Sort all players by season avg to assign ranks
    const sorted = [...snapshot.players].sort(
      (a, b) => b.avg_ttfl - a.avg_ttfl
    );

    return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
  }, [snapshot]);

  // Apply eligibility from localStorage
  const playersWithEligibility = useMemo(() => {
    if (!isHydrated) return rankedPlayers.map((p) => ({ ...p, is_eligible: true, days_until_eligible: null }));

    const today = getTodayET();
    const from = new Date(today);
    const allPicks = getAllPicks();

    const eligibilityMap = new Map<number, number>();
    allPicks.forEach((pick) => {
      const diffDays = Math.floor(
        (from.getTime() - new Date(pick.date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays > 0 && diffDays < 30) {
        const existing = eligibilityMap.get(pick.playerId);
        const daysLeft = 30 - diffDays;
        if (!existing || daysLeft > existing) {
          eligibilityMap.set(pick.playerId, daysLeft);
        }
      }
    });

    return rankedPlayers.map((p) => {
      const daysLeft = eligibilityMap.get(p.player_id) ?? null;
      return { ...p, is_eligible: daysLeft === null, days_until_eligible: daysLeft };
    });
  }, [rankedPlayers, isHydrated]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = playersWithEligibility;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q)
      );
    }

    if (sortBy !== "rank") {
      result = [...result].sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        return b[sortBy] - a[sortBy];
      });
    }

    return result;
  }, [playersWithEligibility, search, sortBy]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-5xl font-bold tracking-tight">Rankings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {filtered.length} players · season averages
          </p>
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search player or team…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary w-52"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="text-sm rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="rank">Season avg</option>
            <option value="avg_ttfl_l10">Last 10</option>
            <option value="avg_ttfl_l30d">Last 30d</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg scrollbar-hide">
        <table className="w-full text-sm">
          <thead className="text-xs">
            <tr className="bg-muted/40">
              <th></th>
              <th></th>
              <th
                className="px-3 py-2 text-center font-semibold uppercase tracking-wide text-primary border-l-[3px] border-primary/50"
                colSpan={4}
              >
                TTFL
              </th>
              <th></th>
            </tr>
            <tr className="border-b bg-muted/20">
              <th className="w-10 px-3 py-2 text-right font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium border-l-[3px] border-primary/50">
                Season
              </th>
              <th className="px-3 py-2 text-right font-medium">-14d</th>
              <th className="px-3 py-2 text-right font-medium">L10</th>
              <th className="px-3 py-2 text-right font-medium">30d</th>
              <th className="w-14 px-3 py-2 text-center font-medium">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((player) => {
              const ineligible = isHydrated && !player.is_eligible;
              return (
                <tr
                  key={player.player_id}
                  className="hover:bg-muted/50 transition-colors leading-tight sm:leading-normal"
                >
                  <td className={`w-10 px-3 py-1 text-right tabular-nums text-muted-foreground text-xs ${ineligible ? "opacity-50" : ""}`}>
                    {player.rank}
                  </td>
                  <td className={`px-3 py-1 ${ineligible ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <PlayerInfo
                        playerId={player.player_id}
                        name={player.name}
                        team={player.team}
                        logoSize={LOGO_SIZE}
                      />
                      {ineligible && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {player.days_until_eligible}d
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={`px-3 py-1 text-right tabular-nums border-l-[3px] border-primary/50 bg-primary/3 ${ineligible ? "opacity-50" : ""}`}>
                    {player.avg_ttfl.toFixed(1)}
                  </td>
                  <td className={`px-3 py-1 text-right tabular-nums text-muted-foreground bg-primary/3 ${ineligible ? "opacity-50" : ""}`}>
                    {player.avg_ttfl_week_ago > 0 ? player.avg_ttfl_week_ago.toFixed(1) : "—"}
                  </td>
                  <td className={`px-3 py-1 text-right font-semibold tabular-nums bg-primary/3 ${ineligible ? "opacity-50" : ""}`}>
                    {player.avg_ttfl_l10.toFixed(1)}
                  </td>
                  <td className={`px-3 py-1 text-right tabular-nums text-muted-foreground bg-primary/3 ${ineligible ? "opacity-50" : ""}`}>
                    {player.avg_ttfl_l30d.toFixed(1)}
                  </td>
                  <td className="w-14 px-3 py-1 text-center">
                    <RankTrend delta={player.rank_delta} />
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
