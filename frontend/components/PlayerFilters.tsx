'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Filter, SortAsc } from 'lucide-react';

export type SortOption = 'avg-desc' | 'avg-asc' | 'name-asc' | 'name-desc';
export type FilterOption = 'all' | 'available' | 'locked';

interface PlayerFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterBy: FilterOption;
  onFilterChange: (filter: FilterOption) => void;
  totalCount: number;
  availableCount: number;
  lockedCount: number;
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
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={filterBy === 'all' ? 'default' : 'outline'}
          className="cursor-pointer transition-all hover:scale-105"
          onClick={() => onFilterChange('all')}
        >
          All Players: {totalCount}
        </Badge>
        <Badge
          variant={filterBy === 'available' ? 'success' : 'outline'}
          className="cursor-pointer transition-all hover:scale-105"
          onClick={() => onFilterChange('available')}
        >
          Available: {availableCount}
        </Badge>
        <Badge
          variant={filterBy === 'locked' ? 'destructive' : 'outline'}
          className="cursor-pointer transition-all hover:scale-105"
          onClick={() => onFilterChange('locked')}
        >
          Locked: {lockedCount}
        </Badge>
      </div>

      {/* Filter and Sort controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 sm:max-w-60">
          <Select value={filterBy} onValueChange={(value) => onFilterChange(value as FilterOption)}>
            <SelectTrigger className="border-2 hover:border-primary/50 transition-colors shadow-sm">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                <SelectValue placeholder="Filter by" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Players</SelectItem>
              <SelectItem value="available">Available Only</SelectItem>
              <SelectItem value="locked">Locked Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 sm:max-w-60">
          <Select value={sortBy} onValueChange={(value) => onSortChange(value as SortOption)}>
            <SelectTrigger className="border-2 hover:border-primary/50 transition-colors shadow-sm">
              <div className="flex items-center gap-2">
                <SortAsc className="h-4 w-4 text-primary" />
                <SelectValue placeholder="Sort by" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="avg-desc">TTFL Score: High to Low</SelectItem>
              <SelectItem value="avg-asc">TTFL Score: Low to High</SelectItem>
              <SelectItem value="name-asc">Name: A to Z</SelectItem>
              <SelectItem value="name-desc">Name: Z to A</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
