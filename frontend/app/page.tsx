import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { redirect } from "next/navigation";

import PlayersView from "@/components/PlayersView";
import { getPlayersForDate, getTodayET, PlayersResponse } from "@/lib/api";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

/**
 * Validate date parameter.
 * Returns the validated date string or null if invalid.
 * Uses Eastern Time as reference (NBA schedule timezone).
 */
function validateDate(dateParam: string | undefined, todayET: string): string | null {
  if (!dateParam) {
    return todayET;
  }

  // Validate format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateParam)) {
    return null;
  }

  // Validate range (±30 days from today ET)
  const selectedDate = new Date(dateParam);
  const todayDate = new Date(todayET);
  const daysDiff = Math.floor(
    (selectedDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff < -30 || daysDiff > 30) {
    return null;
  }

  return dateParam;
}

/**
 * Fetch players with error handling.
 * Returns empty response on error to allow graceful degradation.
 */
async function fetchPlayers(date: string): Promise<PlayersResponse> {
  try {
    return await getPlayersForDate(date);
  } catch (error) {
    console.error("Failed to fetch players:", error);
    return { players: [], games: [] };
  }
}

function LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
        <Loader2 className="h-20 w-20 animate-spin text-primary" />
      </div>
      <p className="text-lg font-semibold mt-8 text-foreground">
        Loading players
      </p>
    </div>
  );
}

/**
 * Home page - Server Component.
 * Fetches player data server-side for faster initial render.
 */
export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const todayET = getTodayET();
  const validDate = validateDate(params.date, todayET);

  // Redirect to home if date is invalid
  if (validDate === null) {
    redirect("/");
  }

  // Fetch players on the server
  const data = await fetchPlayers(validDate);

  return (
    <Suspense fallback={<LoadingFallback />}>
      <PlayersView
        initialPlayers={data.players}
        initialGames={data.games}
        initialDate={validDate}
      />
    </Suspense>
  );
}
