import React, { useState } from "react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };

interface CampaignActionsProps {
  openIssueCount: number;
  judgeStreamUrl: string;
  fixerStreamUrl: string;
  issuesUrl: string;
  pullsUrl: string;
  className?: string;
}

export function CampaignActions({
  openIssueCount,
  judgeStreamUrl,
  fixerStreamUrl,
  issuesUrl,
  pullsUrl,
  className,
}: CampaignActionsProps) {
  const [running, setRunning] = useState<null | "judge" | "fixer">(null);
  const [result, setResult] = useState<null | "judge" | "fixer">(null);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  function runStream(type: "judge" | "fixer", url: string) {
    setRunning(type);
    setResult(null);
    setLog([]);
    setError(null);

    const es = new EventSource(url);

    es.addEventListener("message", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LogEvent;
      setLog((prev) => [...prev, event]);
    });
    es.addEventListener("done", () => {
      es.close();
      setRunning(null);
      setResult(type);
    });
    es.addEventListener("failed", (e: Event) => {
      es.close();
      setRunning(null);
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as string)
        : "Unknown error";
      setError(msg);
    });
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) {
        es.close();
        setRunning(null);
        setError("Connection lost");
      }
    };
  }

  return (
    <div className={cn("mt-4 p-4 rounded bg-muted", className)}>
      <p className="text-xs font-mono text-muted-foreground mb-3">
        Open Issues:{" "}
        <span className={`font-semibold ${openIssueCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
          {openIssueCount}
        </span>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="default"
          onClick={() => runStream("judge", judgeStreamUrl)}
          disabled={running !== null}
        >
          {running === "judge" ? "Running..." : "Generate Issues"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => runStream("fixer", fixerStreamUrl)}
          disabled={running !== null || openIssueCount === 0}
        >
          {running === "fixer" ? "Running..." : "Fix Issues"}
        </Button>
      </div>

      {log.length > 0 && (
        <div className="mt-3 text-xs bg-card border border-border rounded p-3 max-h-48 overflow-y-auto font-mono">
          {log.map((entry, i) =>
            <span key={i} className="block whitespace-pre-wrap text-muted-foreground">
              {entry.message}
            </span>
          )}
        </div>
      )}

      {result === "judge" && (
        <p className="mt-3 text-sm">
          <a href={issuesUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            View open issues
          </a>
        </p>
      )}
      {result === "fixer" && (
        <p className="mt-3 text-sm">
          <a href={pullsUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            View open PRs \u2192
          </a>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}