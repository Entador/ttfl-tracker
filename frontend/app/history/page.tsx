'use client';

import { useEffect, useState, useMemo } from 'react';
import { getPickHistory, PickHistory } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScoreBadge } from '@/components/ScoreBadge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Loader2, TrendingUp, Target, Trophy, Calendar } from 'lucide-react';
import Link from 'next/link';

export default function HistoryPage() {
  const [history, setHistory] = useState<PickHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      setLoading(true);
      setError(null);
      const data = await getPickHistory(50);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    if (history.length === 0) {
      return {
        totalPicks: 0,
        totalScore: 0,
        avgScore: 0,
        bestScore: 0,
        worstScore: 0,
        above40: 0,
        above50: 0,
      };
    }

    const totalScore = history.reduce((sum, pick) => sum + pick.ttfl_score, 0);
    const scores = history.map(p => p.ttfl_score);

    return {
      totalPicks: history.length,
      totalScore,
      avgScore: totalScore / history.length,
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
      above40: history.filter(p => p.ttfl_score >= 40).length,
      above50: history.filter(p => p.ttfl_score >= 50).length,
    };
  }, [history]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 animate-fade-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-muted absolute"></div>
          <Loader2 className="h-20 w-20 animate-spin text-primary" />
        </div>
        <p className="text-lg font-semibold mt-8 text-foreground">Loading pick history</p>
        <p className="text-sm text-muted-foreground mt-2 animate-pulse-subtle">Analyzing your performance...</p>
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
          <p className="text-muted-foreground mb-6 text-center max-w-md">{error}</p>
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
            Start by picking a player from tonight's games and build your history
          </p>
          <Button asChild size="lg" className="shadow-md">
            <Link href="/">View Tonight's Players</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="animate-slide-up">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 bg-linear-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
          Pick History
        </h1>
        <p className="text-lg text-muted-foreground">
          Track your performance across {stats.totalPicks} picks
        </p>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
              Total Picks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              {stats.totalPicks}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              {stats.above40} above 40 pts
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </div>
              Average Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-blue-600 to-blue-500 bg-clip-text text-transparent">
              {stats.avgScore.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              pts per game
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Trophy className="h-4 w-4 text-green-600" />
              </div>
              Best Pick
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-green-600 to-green-500 bg-clip-text text-transparent">
              {stats.bestScore}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              Worst: {stats.worstScore} pts
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600 hover:shadow-lg transition-all duration-300">
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-2 text-xs font-semibold">
              <div className="p-2 rounded-lg bg-purple-600/10">
                <Calendar className="h-4 w-4 text-purple-600" />
              </div>
              Total Score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black bg-linear-to-br from-purple-600 to-purple-500 bg-clip-text text-transparent">
              {stats.totalScore}
            </div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">
              {stats.above50} elite picks (50+)
            </p>
          </CardContent>
        </Card>
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
                <TableHead>Matchup</TableHead>
                <TableHead className="text-right">TTFL Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((pick, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {new Date(pick.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/players/${pick.player_id}`}
                      className="font-medium hover:text-primary transition-colors"
                    >
                      {pick.player_name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{pick.team}</p>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {pick.is_home ? 'vs' : '@'}
                    </span>{' '}
                    {pick.opponent}
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreBadge score={pick.ttfl_score} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Performance insights */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-full p-2">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Overall Performance</p>
              <p className="text-sm text-muted-foreground">
                {stats.avgScore >= 40
                  ? 'Excellent picking strategy! Your average is well above the target.'
                  : stats.avgScore >= 30
                  ? 'Good performance with solid picks. Keep it up!'
                  : 'Room for improvement. Focus on higher-scoring opportunities.'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-green-500/10 rounded-full p-2">
              <Trophy className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="font-medium">Success Rate</p>
              <p className="text-sm text-muted-foreground">
                {((stats.above40 / stats.totalPicks) * 100).toFixed(1)}% of your picks scored 40+ points
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-purple-500/10 rounded-full p-2">
              <Target className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="font-medium">Elite Picks</p>
              <p className="text-sm text-muted-foreground">
                {stats.above50} elite performance{stats.above50 !== 1 ? 's' : ''} (50+ points) out of {stats.totalPicks} total picks
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
