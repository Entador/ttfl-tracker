"use client";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, SortAsc, Trophy } from "lucide-react";
import { useState } from "react";

export type SortOption = "avg-desc" | "avg-asc" | "name-asc" | "name-desc";
export type FilterOption = "all" | "available" | "locked";

export interface Game {
  key: string;
  awayTeam: string;
  homeTeam: string;
  label: string;
}

interface PlayerFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  totalCount?: number | null;
  availableCount?: number | null;
  lockedCount?: number | null;
  gamesCount?: number | null;
  games?: Game[];
  selectedGame?: string | null;
  onGameChange?: (gameKey: string | null) => void;
}

export default function PlayerFilters({
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  totalCount,
  availableCount,
  lockedCount,
  gamesCount,
  games = [],
  selectedGame,
  onGameChange,
}: PlayerFiltersProps) {
  const [open, setOpen] = useState(false);
  const selectedGameData = games.find((g) => g.key === selectedGame);

  return (
    <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Filter badges */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-2 sm:py-2 text-xs font-medium rounded-full border border-input hover:bg-accent transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed leading-none"
              disabled={gamesCount === null}
              onClick={(e) => {
                if ('ontouchstart' in window) e.currentTarget.blur();
              }}
            >
              <Trophy className="h-3 w-3" />
              <span className="text-[11px] sm:text-xs leading-none">
                {gamesCount === null ? (
                  "— games"
                ) : selectedGameData ? (
                  <span className="font-mono leading-none">
                    {selectedGameData.awayTeam} @ {selectedGameData.homeTeam}
                  </span>
                ) : (
                  `${gamesCount} ${gamesCount === 1 ? "game" : "games"}`
                )}
              </span>
            </button>
          </PopoverTrigger>
          {typeof gamesCount === "number" && gamesCount > 0 && (
            <PopoverContent align="start" className="w-40 p-1" sideOffset={4}>
              <div className="space-y-0">
                {/* All games option */}
                <button
                  onClick={(e) => {
                    if ('ontouchstart' in window) e.currentTarget.blur();
                    onGameChange?.(null);
                    setOpen(false);
                  }}
                  className={`w-full px-2 py-1.5 text-xs rounded transition-colors text-left ${
                    !selectedGame
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-accent"
                  }`}
                >
                  <span>All games</span>
                </button>

                {/* Games list */}
                {games.map((game) => {
                  const isSelected = selectedGame === game.key;
                  return (
                    <button
                      key={game.key}
                      onClick={(e) => {
                        if ('ontouchstart' in window) e.currentTarget.blur();
                        onGameChange?.(game.key);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded transition-colors ${
                        isSelected ? "bg-accent font-medium" : "hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-mono">{game.awayTeam}</span>
                        <span className="text-muted-foreground">@</span>
                        <span className="font-mono">{game.homeTeam}</span>
                      </div>
                      {isSelected && <Check className="h-3 w-3 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          )}
        </Popover>
        <Badge
          variant={filterBy === "available" ? "default" : "outline"}
          className="cursor-pointer shrink-0 px-2 sm:px-3 py-2 sm:py-2 text-[11px] sm:text-xs leading-none"
          onClick={() => onFilterChange("available")}
        >
          Available: {availableCount ?? "—"}
        </Badge>
        <Badge
          variant={filterBy === "all" ? "default" : "outline"}
          className="cursor-pointer shrink-0 px-2 sm:px-3 py-2 sm:py-2 text-[11px] sm:text-xs leading-none"
          onClick={() => onFilterChange("all")}
        >
          All: {totalCount ?? "—"}
        </Badge>
        <Badge
          variant={filterBy === "locked" ? "default" : "outline"}
          className="cursor-pointer shrink-0 px-2 sm:px-3 py-2 sm:py-2 text-[11px] sm:text-xs leading-none"
          onClick={() => onFilterChange("locked")}
        >
          Locked: {lockedCount ?? "—"}
        </Badge>
      </div>

      {/* Sort dropdown */}
      <Select
        value={sortBy}
        onValueChange={(value) => onSortChange(value as SortOption)}
      >
        <SelectTrigger className="w-full sm:w-44 h-9">
          <div className="flex items-center gap-2">
            <SortAsc className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="avg-desc">TTFL: High to Low</SelectItem>
          <SelectItem value="avg-asc">TTFL: Low to High</SelectItem>
          <SelectItem value="name-asc">Name: A to Z</SelectItem>
          <SelectItem value="name-desc">Name: Z to A</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
