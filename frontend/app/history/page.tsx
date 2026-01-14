"use client";

import ImportPicks from "@/components/ImportPicks";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllPlayers, getSnapshot, getTodayET, PlayerBasic } from "@/lib/api";
import { getAllPicks, getForgottenDates, Pick, skipDate } from "@/lib/picks";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Loader2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface PickWithPlayer extends Pick {
  playerName: string;
  team: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<PickWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [forgottenDates, setForgottenDates] = useState<string[]>([]);

  useEffect(() => {
    loadHistory();
    loadForgottenDates();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      setError(null);

      // Get picks from localStorage
      const picks = getAllPicks();

      if (picks.length === 0) {
        setHistory([]);
        setLoading(false);
        return;
      }

      // Fetch all players to get names
      const players = await getAllPlayers();
      const playerMap = new Map<number, PlayerBasic>();
      players.forEach((p) => playerMap.set(p.player_id, p));

      // Match picks with player info
      const picksWithPlayers: PickWithPlayer[] = picks
        .map((pick) => {
          const player = playerMap.get(pick.playerId);
          if (!player) return null;

          // Ensure team is a string (defensive programming)
          const team = typeof player.team === "string" ? player.team : "";

          return {
            ...pick,
            playerName: player.name,
            team,
          };
        })
        .filter((p): p is PickWithPlayer => p !== null)
        .sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

      setHistory(picksWithPlayers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }

  async function loadForgottenDates() {
    try {
      const snapshot = await getSnapshot();
      const todayET = getTodayET();
      const forgotten = getForgottenDates(snapshot, todayET);
      setForgottenDates(forgotten);
    } catch (err) {
      console.error("Failed to load forgotten dates:", err);
    }
  }

  function handleSkipDate(date: string) {
    skipDate(date);
    loadForgottenDates(); // Refresh the list
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
          <Loader2 className="h-20 w-20 animate-spin text-primary" />
        </div>
        <p className="text-lg font-semibold mt-8 text-foreground">
          Loading pick history
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 shadow-lg animate-slide-up">
        <CardContent className="flex flex-col items-center py-16">
          <div className="p-4 rounded-full bg-destructive/10 mb-6">
            <AlertCircle className="h-16 w-16 text-destructive" />
          </div>
          <h3 className="text-2xl font-bold mb-2">Error loading history</h3>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            {error}
          </p>
          <Button onClick={loadHistory} size="lg" className="shadow-md">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <>
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <Card className="w-full max-w-lg animate-slide-up">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <div className="mb-6 rounded-full bg-primary/10 p-5">
                <Calendar className="h-14 w-14 text-primary" />
              </div>

              <h3 className="mb-2 text-2xl font-semibold">No picks yet</h3>

              <p className="mb-8 max-w-md text-muted-foreground">
                Start by picking a player from tonight&apos;s games or import
                your existing history to see past picks.
              </p>

              <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
                <Button asChild size="lg" className="sm:min-w-55 shadow-md">
                  <Link href="/">View Tonight&apos;s Players</Link>
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="sm:min-w-55"
                  onClick={() => setShowImport(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import History
                </Button>
              </div>

              <div className="mt-10 flex w-full items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Tip
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                You can always import past picks later from your settings.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Import modal */}
        {showImport && (
          <ImportPicks
            onImportComplete={loadHistory}
            onClose={() => setShowImport(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="animate-slide-up flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 bg-linear-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
            Pick History
          </h1>
          <p className="text-lg text-muted-foreground">
            Your player picks ({history.length} total)
          </p>
        </div>
        <Button
          onClick={() => setShowImport(true)}
          variant="outline"
          className="shrink-0"
        >
          <Upload className="h-4 w-4 mr-2" />
          Import History
        </Button>
      </div>

      {/* Forgotten dates section */}
      {forgottenDates.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-base sm:text-lg">
                  Forgotten Picks
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {forgottenDates.length} date
                  {forgottenDates.length !== 1 ? "s" : ""} in the past month
                  without a pick
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-1.5 sm:space-y-2">
              {forgottenDates.map((date) => (
                <div
                  key={date}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-background border overflow-hidden"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">
                      {new Date(date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto shrink-0">
                    <Button
                      size="sm"
                      asChild
                      className="flex-1 sm:flex-none text-xs min-w-0"
                    >
                      <Link href={`/?date=${date}`}>
                        <UserCheck className="h-2 w-2 shrink-0" />
                        <span>Pick Player</span>
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSkipDate(date)}
                      className="flex-1 sm:flex-none text-xs min-w-0"
                    >
                      <X className="h-2 w-2 shrink-0" />
                      <p className="">Mark as Skipped</p>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History table */}
      <Card>
        <CardHeader>
          <CardTitle>All Picks</CardTitle>
          <CardDescription>
            Complete history of your player selections
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Team</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((pick, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {new Date(pick.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/players/${pick.playerId}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {pick.playerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {pick.team || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Import modal */}
      {showImport && (
        <ImportPicks
          onImportComplete={loadHistory}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
