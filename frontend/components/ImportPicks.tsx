"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, CheckCircle2, X } from "lucide-react";
import { parseAndMatchTTFLData } from "@/lib/import";
import { importPicks } from "@/lib/picks";

interface ImportPicksProps {
  onImportComplete: () => void;
  onClose: () => void;
}

export default function ImportPicks({ onImportComplete, onClose }: ImportPicksProps) {
  const [tsvData, setTsvData] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    imported: number;
    skipped: number;
    unmatched: string[];
    error?: string;
  } | null>(null);

  const handleImport = async () => {
    if (!tsvData.trim()) {
      setResult({
        success: false,
        imported: 0,
        skipped: 0,
        unmatched: [],
        error: "Please paste your TTFL data first",
      });
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      // Parse and match player names
      const { picks, unmatched, error } = await parseAndMatchTTFLData(tsvData);

      if (error) {
        setResult({
          success: false,
          imported: 0,
          skipped: 0,
          unmatched,
          error,
        });
        return;
      }

      // Import picks to localStorage
      const { imported, skipped } = importPicks(picks);

      setResult({
        success: true,
        imported,
        skipped,
        unmatched,
      });

      // Refresh the parent component
      if (imported > 0) {
        setTimeout(() => {
          onImportComplete();
        }, 1500);
      }
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        skipped: 0,
        unmatched: [],
        error: err instanceof Error ? err.message : "Unknown error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Historical Picks
            </CardTitle>
            <CardDescription className="mt-2">
              Paste your TTFL history data from the website (tab-separated format)
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Instructions */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">How to import:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Go to your{" "}
                <a
                  href="https://fantasy.trashtalk.co/?tpl=historique"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  TTFL history page
                </a>{" "}
                and copy your pick history table
              </li>
              <li>Paste the data in the text area below</li>
              <li>Click "Import Picks" to add them to your local history</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Only picks from the last 30 days will be imported to maintain eligibility tracking.
            </p>
          </div>

          {/* Textarea */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Paste TTFL data here
            </label>
            <textarea
              value={tsvData}
              onChange={(e) => setTsvData(e.target.value)}
              placeholder="Date	Joueur	Pts	Reb	Ast	Stl	Blk	Ftm	Fgm	Fg3m	Malus	Score
2025-10-21	Shai Gilgeous-Alexander	35	5	5	2	2	10	12	1	29	43
2025-10-22	Cade Cunningham	23	7	10	1	0	6	8	1	28	28"
              className="w-full h-48 p-3 text-sm font-mono bg-background border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg p-4 ${
                result.success
                  ? "bg-green-500/10 border border-green-500/20"
                  : "bg-destructive/10 border border-destructive/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <p className="font-medium">
                    {result.success ? "Import Successful!" : "Import Failed"}
                  </p>
                  {result.success ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Imported {result.imported} pick{result.imported !== 1 ? "s" : ""}
                        {result.skipped > 0 && (
                          <> ({result.skipped} skipped as outside 30-day window)</>
                        )}
                      </p>
                      {result.unmatched.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm font-medium text-amber-600">
                            Warning: {result.unmatched.length} player
                            {result.unmatched.length !== 1 ? "s" : ""} could not be matched:
                          </p>
                          <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            {result.unmatched.slice(0, 5).map((name, i) => (
                              <li key={i}>• {name}</li>
                            ))}
                            {result.unmatched.length > 5 && (
                              <li>• ... and {result.unmatched.length - 5} more</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{result.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              {result?.success ? "Close" : "Cancel"}
            </Button>
            <Button onClick={handleImport} disabled={loading || !tsvData.trim()}>
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Picks
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
