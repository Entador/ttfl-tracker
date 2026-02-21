import useSWR from 'swr';
import { getSnapshot, SnapshotData } from '@/lib/api';

/**
 * SWR hook for fetching and caching snapshot data.
 * Cache is shared across all pages - eliminates re-fetching on navigation.
 */
export function useSnapshot() {
  return useSWR<SnapshotData>('/api/snapshot', getSnapshot, {
    revalidateOnFocus: false, // Don't refetch when user returns to tab
    revalidateOnReconnect: false, // Don't refetch on reconnect
    dedupingInterval: 60000, // Dedupe requests within 1 minute
    // Data updates once daily via GitHub Actions, so we can cache aggressively
    // User can manually refresh the page if they want fresh data
  });
}
