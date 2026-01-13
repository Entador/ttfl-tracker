"use client";

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
import { getAllPlayers, PlayerBasic } from "@/lib/api";
import { getAllPicks, Pick } from "@/lib/picks";
import {
  AlertCircle,
  Calendar,
  Loader2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ImportPicks from "@/components/ImportPicks";

interface PickWithPlayer extends Pick {
  playerName: string;
  team: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<PickWithPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    loadHistory();
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
      players.forEach(p => playerMap.set(p.player_id, p));

      // Match picks with player info
      const picksWithPlayers: PickWithPlayer[] = picks
        .map(pick => {
          const player = playerMap.get(pick.playerId);
          if (!player) return null;

          // Ensure team is a string (defensive programming)
          const team = typeof player.team === 'string' ? player.team : '';

          return {
            ...pick,
            playerName: player.name,
            team,
          };
        })
        .filter((p): p is PickWithPlayer => p !== null)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(picksWithPlayers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
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
      <Card className="animate-slide-up">
        <CardContent className="flex flex-col items-center py-16">
          <div className="p-4 rounded-full bg-primary/10 mb-6">
            <Calendar className="h-16 w-16 text-primary" />
          </div>
          <h3 className="text-2xl font-bold mb-2">No picks yet</h3>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            Start by picking a player from tonight&apos;s games and build your
            history
          </p>
          <Button asChild size="lg" className="shadow-md">
            <Link href="/">View Tonight&apos;s Players</Link>
          </Button>
        </CardContent>
      </Card>
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
