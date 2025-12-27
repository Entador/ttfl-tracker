"use client";

import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "@/components/ScoreBadge";
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
import { getPlayerStats, PlayerStats } from "@/lib/api";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PlayerDetailPage() {
  const params = useParams();
  const playerId = parseInt(params.id as string);

  const [data, setData] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (playerId) {
      loadPlayerStats();
    }
  }, [playerId]);

  async function loadPlayerStats() {
    try {
      setLoading(true);
      setError(null);
      const stats = await getPlayerStats(playerId);
      setData(stats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load player stats"
      );
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
          Loading player stats
        </p>
        <p className="text-sm text-muted-foreground mt-2 animate-pulse-subtle">
          Gathering performance data...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/50 shadow-lg animate-slide-up">
        <CardContent className="flex flex-col items-center py-16">
          <div className="p-4 rounded-full bg-destructive/10 mb-6">
            <AlertCircle className="h-16 w-16 text-destructive" />
          </div>
          <h3 className="text-2xl font-bold mb-2">Error loading player</h3>
          <p className="text-muted-foreground mb-6 text-center max-w-md">
            {error || "Player not found"}
          </p>
          <Button asChild size="lg" className="shadow-md">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Tonight's Players
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const pickedGames = data.recent_games.filter((g) => g.picked);
  const avgPicked =
    pickedGames.length > 0
      ? (
          pickedGames.reduce((sum, g) => sum + g.ttfl_score, 0) /
          pickedGames.length
        ).toFixed(1)
      : "0.0";

  const bestScore = Math.max(...data.recent_games.map((g) => g.ttfl_score));
  const worstScore = Math.min(...data.recent_games.map((g) => g.ttfl_score));

  // Calculate consistency (lower standard deviation = more consistent)
  const scores = data.recent_games.map((g) => g.ttfl_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) /
    scores.length;
  const stdDev = Math.sqrt(variance);
  const consistency = stdDev < 10 ? "High" : stdDev < 15 ? "Medium" : "Low";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-slide-up">
        <Button
          variant="ghost"
          asChild
          className="mb-6 hover:bg-accent transition-all"
        >
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tonight's Players
          </Link>
        </Button>
        <div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 bg-linear-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
            {data.player.name}
          </h1>
          <p className="text-lg text-muted-foreground">{data.player.team}</p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-primary/10">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              Average TTFL
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              {data.avg_ttfl.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Last {data.recent_games.length} games
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Target className="h-4 w-4 text-green-600" />
              </div>
              Times Picked
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-green-600 to-green-500 bg-clip-text text-transparent">
              {pickedGames.length}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              {pickedGames.length > 0
                ? `Avg: ${avgPicked} pts`
                : "Not picked yet"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Trophy className="h-4 w-4 text-amber-600" />
              </div>
              Best Performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-black`}>{bestScore}</div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Worst: {worstScore} pts
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
              </div>
              Consistency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-blue-600 to-blue-500 bg-clip-text text-transparent">
              {consistency}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Std Dev: {stdDev.toFixed(1)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Games */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Games</CardTitle>
          <CardDescription>
            Performance history across {data.recent_games.length} recent games
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Matchup</TableHead>
                <TableHead className="text-right">TTFL Score</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_games.map((game, index) => (
                <TableRow
                  key={index}
                  className={game.picked ? "bg-muted/50" : ""}
                >
                  <TableCell className="font-medium">
                    {new Date(game.game_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {game.is_home ? "vs" : "@"}
                    </span>{" "}
                    {game.opponent}
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreBadge score={game.ttfl_score} />
                  </TableCell>

                  <TableCell className="text-center">
                    {game.picked && (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Picked
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Performance Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Average Performance</p>
              <p className="text-sm text-muted-foreground">
                {data.avg_ttfl >= 45
                  ? "Elite player with consistently high scores"
                  : data.avg_ttfl >= 35
                  ? "Solid performer with good scoring potential"
                  : "Developing player with room for improvement"}
              </p>
            </div>
          </div>
          {pickedGames.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="bg-green-500/10 rounded-full p-2">
                <Target className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium">Pick History</p>
                <p className="text-sm text-muted-foreground">
                  Picked {pickedGames.length} time
                  {pickedGames.length !== 1 ? "s" : ""} with an average of{" "}
                  {avgPicked} points
                </p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <div className="bg-purple-500/10 rounded-full p-2">
              <Trophy className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="font-medium">Consistency Rating</p>
              <p className="text-sm text-muted-foreground">
                {consistency === "High"
                  ? "Very reliable with minimal variance in performance"
                  : consistency === "Medium"
                  ? "Moderate consistency with occasional fluctuations"
                  : "High variance - performance can be unpredictable"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
