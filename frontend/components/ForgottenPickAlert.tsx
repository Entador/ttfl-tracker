"use client";

import { AlertTriangle, UserCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ForgottenPickAlertProps {
  date: string;
  onPickNow: () => void; // Dismiss alert and scroll to player list
  onSkip: () => void; // Mark as skipped
  onDismiss: () => void; // Close alert (temporary)
}

export default function ForgottenPickAlert({
  date,
  onPickNow,
  onSkip,
  onDismiss,
}: ForgottenPickAlertProps) {
  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 animate-slide-up">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm mb-1">No pick recorded</h3>
            <p className="text-xs text-muted-foreground">
              You haven't made a pick for {formattedDate}. Would you like to
              pick a player now or skip this date?
            </p>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            size="sm"
            onClick={onPickNow}
            className="flex-1 sm:flex-none"
          >
            <UserCheck className="h-4 w-4 mr-1.5" />
            Pick Now
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSkip}
            className="flex-1 sm:flex-none"
          >
            Skip
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            className="px-2"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
