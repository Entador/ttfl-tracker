"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GameData {
  game_date: string;
  ttfl_score: number;
  picked: boolean;
}

interface ScoreChartProps {
  games: GameData[];
  avgScore: number;
}

// Custom dot that highlights picked games
function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: { picked: boolean; score: number };
}) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;

  const isPicked = payload.picked;
  const isGood = payload.score >= 40;
  const isBad = payload.score < 25;

  return (
    <g>
      {isPicked && (
        <circle
          cx={cx}
          cy={cy}
          r={8}
          fill="hsl(var(--primary))"
          fillOpacity={0.2}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={isPicked ? 5 : 3}
        fill={
          isGood
            ? "hsl(142 76% 36%)"
            : isBad
            ? "hsl(0 84% 60%)"
            : "hsl(var(--primary))"
        }
        stroke={isPicked ? "hsl(var(--background))" : "none"}
        strokeWidth={isPicked ? 2 : 0}
      />
    </g>
  );
}

// Custom tooltip with more info
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: { score: number; picked: boolean } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const isGood = data.score >= 40;
  const isBad = data.score < 25;

  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 min-w-30">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${
          isGood
            ? "text-green-600"
            : isBad
            ? "text-red-500"
            : "text-foreground"
        }`}
      >
        {data.score} pts
      </p>
      {data.picked && (
        <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-border">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-xs text-primary font-medium">Picked</span>
        </div>
      )}
    </div>
  );
}

export function ScoreChart({ games, avgScore }: ScoreChartProps) {
  const chartData = [...games].reverse().map((game) => ({
    date: new Date(game.game_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    score: game.ttfl_score,
    picked: game.picked,
  }));

  // Calculate Y-axis domain with some padding
  const scores = chartData.map((d) => d.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const yMin = Math.max(0, Math.floor(minScore / 10) * 10 - 10);
  const yMax = Math.ceil(maxScore / 10) * 10 + 10;

  return (
    <div className="h-52 sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.25}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
          />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            tickMargin={4}
            width={28}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              stroke: "hsl(var(--muted-foreground))",
              strokeOpacity: 0.3,
              strokeDasharray: "4 4",
            }}
          />
          <ReferenceLine
            y={avgScore}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="6 4"
            strokeOpacity={0.6}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            fill="url(#scoreGradient)"
            dot={<CustomDot />}
            activeDot={{
              r: 6,
              fill: "hsl(var(--primary))",
              stroke: "hsl(var(--background))",
              strokeWidth: 2,
            }}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
