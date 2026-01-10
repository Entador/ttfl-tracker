import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

/**
 * TTFL Score color thresholds:
 * - < 10: Soft slate (very low)
 * - 10-20: Soft blue (low)
 * - 20-30: Soft yellow (below average)
 * - 30-40: Amber (average)
 * - 40-50: Orange (above average)
 * - 50-60: Orange-red (good)
 * - 60-70: Red (very good)
 * - 70+: Purple (elite)
 */
function getScoreColor(score: number): { bg: string; text: string } {
  if (score < 10) {
    return { bg: "bg-slate-300", text: "text-slate-900" };
  }
  if (score < 20) {
    return { bg: "bg-blue-300", text: "text-blue-950" };
  }
  if (score < 30) {
    return { bg: "bg-yellow-300", text: "text-yellow-950" };
  }
  if (score < 40) {
    return { bg: "bg-amber-400", text: "text-amber-950" };
  }
  if (score < 50) {
    return { bg: "bg-orange-400", text: "text-orange-950" };
  }
  if (score < 60) {
    return { bg: "bg-orange-500", text: "text-white" };
  }
  if (score < 70) {
    return { bg: "bg-red-500", text: "text-white" };
  }

  // 70+ elite
  return { bg: "bg-purple-500", text: "text-white" };
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const colors = getScoreColor(score);

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-1 text-sm font-bold shadow-md",
        colors.bg,
        colors.text,
        className
      )}
    >
      {score}
    </div>
  );
}
