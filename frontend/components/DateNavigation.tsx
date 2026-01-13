"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTodayET } from "@/lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface DateNavigationProps {
  currentDate: string; // YYYY-MM-DD (in Eastern Time)
  forgottenCount?: number; // Number of forgotten dates
  hasForgottenToday?: boolean; // Is current date forgotten
}

// Parse YYYY-MM-DD string to Date object (treating as local date)
const parseLocalDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

export default function DateNavigation({
  currentDate,
  forgottenCount = 0,
  hasForgottenToday = false,
}: DateNavigationProps) {
  const router = useRouter();

  // Parse current date
  const date = parseLocalDate(currentDate);

  // Use Eastern Time as reference (NBA schedule timezone)
  const todayET = getTodayET();
  const today = parseLocalDate(todayET);

  // Limits: ±30 days
  const minDate = new Date(today);
  minDate.setDate(today.getDate() - 30);

  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);

  const isAtMin = date < minDate;
  const isAtMax = date > maxDate;

  const navigateDate = (offset: number) => {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + offset);

    const dateStr = toDateKey(newDate);

    // Navigate to home if it's today in ET, otherwise use date param
    if (dateStr === todayET) {
      router.push("/");
    } else {
      router.push(`/?date=${dateStr}`);
    }
  };

  const isToday = currentDate === todayET;

  const formatDate = (date: Date): string => {
    if (isToday) return "Today";

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (toDateKey(date) === toDateKey(yesterday)) return "Yesterday";

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (toDateKey(date) === toDateKey(tomorrow)) return "Tomorrow";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatFullDate = (date: Date) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 border-2 border-input rounded-2xl p-1.5 sm:p-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 sm:h-9 sm:w-9"
        onClick={() => navigateDate(-1)}
        disabled={isAtMin}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-28 sm:min-w-40 text-center flex items-center justify-center h-10 sm:h-11">
        <div className="relative">
          <div className="flex flex-col items-center justify-center leading-tight">
            <span className="text-base sm:text-lg font-semibold">
              {formatDate(date)}
            </span>

            {(formatDate(date) === "Today" ||
              formatDate(date) === "Yesterday" ||
              formatDate(date) === "Tomorrow") && (
              <span className="text-[11px] sm:text-xs text-muted-foreground">
                {formatFullDate(date)}
              </span>
            )}
          </div>

          {/* Badge for forgotten dates count */}
          {forgottenCount > 0 && !hasForgottenToday && (
            <Badge
              variant="secondary"
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-amber-500 text-white border-0 hover:bg-amber-500"
            >
              {forgottenCount}
            </Badge>
          )}

          {/* Dot indicator for current forgotten date */}
          {hasForgottenToday && (
            <div className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-background" />
          )}
        </div>
      </div>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 sm:h-9 sm:w-9"
        onClick={() => navigateDate(1)}
        disabled={isAtMax}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
