import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

/**
 * TTFL Score color thresholds:
 * - < 15: Blue (really bad)
 * - 15-25: Yellow (below average)
 * - 25-35: Orange (average)
 * - 35-45: Red (good)
 * - 45+: Purple (excellent)
 */
function getScoreColor(score: number): { bg: string; text: string } {
  if (score < 10) {
    return { bg: "from-blue-500 to-blue-600", text: "text-white" };
  }
  if (score < 20) {
    return { bg: "from-cyan-400 to-cyan-500", text: "text-cyan-950" };
  }
  if (score < 30) {
    return { bg: "from-yellow-400 to-yellow-500", text: "text-yellow-950" };
  }
  if (score < 40) {
    return { bg: "from-orange-500 to-orange-600", text: "text-white" };
  }
  if (score < 50) {
    return { bg: "from-red-500 to-red-600", text: "text-white" };
  }
  if (score < 60) {
    return { bg: "from-pink-500 to-pink-600", text: "text-white" };
  }

  // 60+ elite
  return { bg: "from-purple-500 to-purple-600", text: "text-white" };
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const colors = getScoreColor(score);

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-1 text-sm font-bold shadow-md",
        "bg-linear-to-r",
        colors.bg,
        colors.text,
        className
      )}
    >
      {score}
    </div>
  );
}
