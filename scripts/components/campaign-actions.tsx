import React, { useState } from "react";
import { Button } from "./ui/button";

type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };

interface CampaignActionsProps {
  openIssueCount: number;
  judgeStreamUrl: string;
  fixerStreamUrl: string;
  issuesUrl: string;
  pullsUrl: string;
}

export function CampaignActions({
  openIssueCount,
  judgeStreamUrl,
  fixerStreamUrl,
  issuesUrl,
  pullsUrl,
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
    <div className="mt-4 mb-2 p-4 border border-gray-200 rounded bg-gray-50">
      <p className="text-xs font-mono text-[#555] mb-3">
        Open Issues:{" "}
        <span className={`font-semibold ${openIssueCount > 0 ? "text-[#1a1a1a]" : "text-[#aaa]"}`}>
          {openIssueCount}
        </span>
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => runStream("judge", judgeStreamUrl)}
          disabled={running !== null}
        >
          {running === "judge" ? "Running\u2026" : "Generate Issues"}
        </Button>
        <Button
          type="button"
          variant="default"
          onClick={() => runStream("fixer", fixerStreamUrl)}
          disabled={running !== null || openIssueCount === 0}
        >
          {running === "fixer" ? "Running\u2026" : "Fix Issues"}
        </Button>
      </div>

      {log.length > 0 && (
        <div className="mt-3 text-xs bg-white border border-gray-200 rounded p-3 max-h-48 overflow-y-auto font-mono">
          {log.map((entry, i) =>
            
              <span key={i} className="block whitespace-pre-wrap text-[#555]">
                {entry.message}
              </span>
            
          )}
        </div>
      )}

      {result === "judge" && (
        <p className="mt-3 text-sm">
          <a href={issuesUrl} target="_blank" rel="noopener noreferrer" className="text-[#0969da] underline">
            View open issues \u2192
          </a>
        </p>
      )}
      {result === "fixer" && (
        <p className="mt-3 text-sm">
          <a href={pullsUrl} target="_blank" rel="noopener noreferrer" className="text-[#0969da] underline">
            View open PRs \u2192
          </a>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-[#cf222e]">{error}</p>}
    </div>
  );
}