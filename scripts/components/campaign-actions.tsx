import React, { useState } from "react";
import { Button } from "./buttons";

interface CampaignActionsProps {
  openIssueCount: number;
  onGenerateIssues: () => Promise<void>;
  onFixIssues: () => Promise<void>;
  issuesUrl: string;
  pullsUrl: string;
}

export function CampaignActions({
  openIssueCount,
  onGenerateIssues,
  onFixIssues,
  issuesUrl,
  pullsUrl,
}: CampaignActionsProps) {
  const [running, setRunning] = useState<null | "judge" | "fixer">(null);
  const [result, setResult] = useState<null | "judge" | "fixer">(null);
  const [error, setError] = useState<string | null>(null);

  async function run(type: "judge" | "fixer", action: () => Promise<void>) {
    setRunning(type);
    setResult(null);
    setError(null);
    try {
      await action();
      setResult(type);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(null);
    }
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
          variant="secondary"
          onClick={() => run("judge", onGenerateIssues)}
          disabled={running !== null}
        >
          {running === "judge" ? "Running\u2026" : "Generate Issues"}
        </Button>
        <Button
          type="button"
          onClick={() => run("fixer", onFixIssues)}
          disabled={running !== null || openIssueCount === 0}
        >
          {running === "fixer" ? "Running\u2026" : "Fix Issues"}
        </Button>
      </div>
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