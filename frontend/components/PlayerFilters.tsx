"use client";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortAsc } from "lucide-react";

export type SortOption = "avg-desc" | "avg-asc" | "name-asc" | "name-desc";
export type FilterOption = "all" | "available" | "locked";

interface PlayerFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  totalCount?: number | null;
  availableCount?: number | null;
  lockedCount?: number | null;
}

export default function PlayerFilters({
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
  totalCount,
  availableCount,
  lockedCount,
}: PlayerFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Filter badges */}
      <div className="flex gap-2 pb-1 sm:pb-0">
        <Badge
          variant={filterBy === "available" ? "success" : "outline"}
          className="cursor-pointer shrink-0"
          onClick={() => onFilterChange("available")}
        >
          Available: {availableCount ?? "—"}
        </Badge>
        <Badge
          variant={filterBy === "all" ? "default" : "outline"}
          className="cursor-pointer shrink-0"
          onClick={() => onFilterChange("all")}
        >
          All: {totalCount ?? "—"}
        </Badge>
        <Badge
          variant={filterBy === "locked" ? "destructive" : "outline"}
          className="cursor-pointer shrink-0"
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
