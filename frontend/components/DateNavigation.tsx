"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

interface DateNavigationProps {
  currentDate: string; // YYYY-MM-DD
}

// Helpers — LOCAL date only
const parseLocalDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

export default function DateNavigation({ currentDate }: DateNavigationProps) {
  const router = useRouter();

  // Parse current date as LOCAL
  const date = parseLocalDate(currentDate);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

    if (dateStr === toDateKey(today)) {
      router.push("/");
    } else {
      router.push(`/?date=${dateStr}`);
    }
  };

  const isToday = toDateKey(date) === toDateKey(today);

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

  return (
    <div className="flex items-center gap-3 border border-neutral-500 rounded-2xl p-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => navigateDate(-1)}
        disabled={isAtMin}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-40 text-center">
        <span className="text-lg font-semibold">{formatDate(date)}</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={() => navigateDate(1)}
        disabled={isAtMax}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
