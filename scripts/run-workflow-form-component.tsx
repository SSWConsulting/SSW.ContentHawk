import React, { useState } from "react";
import { Button } from "./components/buttons";
import { CONTENTHAWK_WORKFLOW_FILE } from "./constants";

type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };

export interface RunWorkflowFormProps {
  targetRepo: string;
  token: string;
}

export function RunWorkflowForm({ targetRepo, token }: RunWorkflowFormProps) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [log, setLog] = useState<LogEvent[]>([]);

  function startRun() {
    setStatus("running");
    setLog([]);
    const es = new EventSource(`/run-workflow-stream?token=${encodeURIComponent(token)}`);
    es.addEventListener("message", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LogEvent;
      setLog((prev) => [...prev, event]);
    });
    es.addEventListener("done", () => {
      es.close();
      setStatus("done");
      setTimeout(() => fetch("/kill", { method: "POST" }), 2000);
    });
    es.addEventListener("failed", (e: Event) => {
      es.close();
      setStatus("error");
      const msg = (e as MessageEvent).data
        ? (JSON.parse((e as MessageEvent).data) as string)
        : "Unknown error";
      setLog((prev) => [...prev, { type: "log", message: `Error: ${msg}` }]);
    });
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) {
        es.close();
        setStatus("error");
        setLog((prev) => [...prev, { type: "log", message: "Connection lost" }]);
      }
    };
  }

  return (
    <div className="font-sans max-w-[540px] mx-auto mt-16 px-4 text-[#1a1a1a]">
      <h1 className="text-xl mb-0">Run ContentHawk Workflow</h1>
      <p className="text-[#555] font-mono mt-1">{targetRepo}</p>
      <p className="text-sm text-[#555] mt-3 mb-6">
        Trigger the <span className="font-mono">{CONTENTHAWK_WORKFLOW_FILE}</span> workflow on this
        repository.
      </p>

      {status === "idle" && (
        <Button type="button" onClick={startRun}>
          Run Workflow
        </Button>
      )}
      {status === "running" && <Button disabled>Running\u2026</Button>}
      {status === "done" && (
        <p className="text-[#1a7f37] font-semibold text-sm">\u2713 Workflow completed successfully.</p>
      )}
      {status === "error" && (
        <p className="text-[#cf222e] font-semibold text-sm">\u2717 Workflow failed. See log above.</p>
      )}

      {log.length > 0 && (
        <div className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-64 overflow-y-auto font-mono">
          {log.map((entry, i) =>
            entry.type === "link" ? (
              <a
                key={i}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-blue-600 underline whitespace-pre-wrap"
              >
                {entry.message}
              </a>
            ) : (
              <span key={i} className="block whitespace-pre-wrap">
                {entry.message}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
