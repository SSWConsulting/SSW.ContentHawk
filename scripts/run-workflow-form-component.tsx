import React, { useState, useEffect } from "react";
import { Button } from "./components/buttons";
import { CampaignStatusPanel, CampaignStatus } from "./components/campaign-status-panel";
import { CampaignItemsTable } from "./components/campaign-items-table";
import { CampaignActions } from "./components/campaign-actions";
import { TooltipProvider } from "./components/ui/tooltip";
import { fetchCampaignStatuses, fetchCampaignItems, fetchOpenIssueCounts } from "./services/contenthawk-service";
import { CONTENTHAWK_WORKFLOW_FILE } from "./constants";
import type { ResolvedCatalog } from "./types";

type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };

const FIELDS = [
  {
    name: "intent",
    label: "Intent",
    description: "What Agent 2 should look for and act on.",
    placeholder: "e.g. archive all outdated blog posts on the topic of AI",
    multiline: true,
  },
  {
    name: "search_scope",
    label: "Search Scope",
    description: "Which content files to scan and how to filter them.",
    placeholder: "e.g. all blog files",
    multiline: false,
  },
  {
    name: "label_name",
    label: "Label Name",
    description: "GitHub label slug to tie the pipeline together. Agent 2 applies it to issues, Agent 3 queries by it.",
    placeholder: "e.g. archive-outdated-blog-posts",
    multiline: false,
  },
  {
    name: "processing_priority",
    label: "Processing Priority",
    description: "How to sort the file list for processing order.",
    placeholder: "e.g. first sort by created date ascending, then by lastUpdated descending",
    multiline: true,
  },
  {
    name: "issue_preferences",
    label: "Issue Preferences",
    description: "Preferences for how Agent 2 creates issues.",
    placeholder: "e.g. use template .github/ISSUE_TEMPLATE/content-review.md, max 20 issues per run",
    multiline: true,
  },
  {
    name: "pr_preferences",
    label: "PR Preferences",
    description: "Preferences for how Agent 3 creates PRs.",
    placeholder: "e.g. bundle up to 5 related issues per PR",
    multiline: true,
  },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];

export interface RunWorkflowFormProps {
  targetRepo: string;
  token: string;
  campaignStatuses?: CampaignStatus[];
}

export function RunWorkflowForm({ targetRepo, token }: RunWorkflowFormProps) {
  const [tab, setTab] = useState<"run" | "progress">("run");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [campaignStatuses, setCampaignStatuses] = useState<CampaignStatus[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ResolvedCatalog>({});
  const [openIssueCounts, setOpenIssueCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchCampaignStatuses(token).then(setCampaignStatuses);
    fetchCampaignItems(token).then(setCatalog);
    fetchOpenIssueCounts(token).then(setOpenIssueCounts);
  }, [token]);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [values, setValues] = useState<Record<FieldName, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.name, ""])) as Record<FieldName, string>,
  );
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});

  function handleChange(name: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function startRun(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newErrors: Partial<Record<FieldName, string>> = {};
    for (const field of FIELDS) {
      if (!values[field.name].trim()) newErrors[field.name] = "Required";
    }
    if (Object.keys(newErrors).length) {
      setFieldErrors(newErrors);
      return;
    }

    setStatus("running");
    setLog([]);

    const params = new URLSearchParams({ token });
    for (const field of FIELDS) params.set(field.name, values[field.name]);

    const es = new EventSource(`/run-workflow-stream?${params}`);
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

  const inputClass =
    "w-full py-[0.55rem] px-[0.65rem] font-mono border border-[#ccc] rounded box-border text-[0.95rem]";

  const tabClass = (t: "run" | "progress") =>
    t === tab
      ? "px-4 py-2 text-sm font-semibold border-b-2 border-[#0969da] text-[#0969da] -mb-px"
      : "px-4 py-2 text-sm text-[#555] border-b-2 border-transparent -mb-px hover:text-[#1a1a1a]";

  return (
    <TooltipProvider>
    <div className="font-sans max-w-[540px] mx-auto mt-16 px-4 text-[#1a1a1a]">
      <div className="flex border-b border-[#ccc] mb-6">
        <button type="button" onClick={() => setTab("run")} className={tabClass("run")}>
          New Campaign
        </button>
        <button type="button" onClick={() => setTab("progress")} className={tabClass("progress")}>
          Campaigns
        </button>
      </div>

      {tab === "run" && (
        <>
          <h1 className="text-xl mb-0">Run ContentHawk Workflow</h1>
          <p className="text-[#555] font-mono mt-1">{targetRepo}</p>
          <p className="text-sm text-[#555] mt-3 mb-6">
            Trigger the <span className="font-mono">{CONTENTHAWK_WORKFLOW_FILE}</span> workflow on this
            repository.
          </p>

          {(status === "idle" || status === "error") && (
            <form onSubmit={startRun} noValidate>
              {FIELDS.map((field) => (
                <label key={field.name} className="block my-5">
                  <span className="block font-semibold mb-1.5 font-mono text-[0.9rem]">
                    {field.label}
                  </span>
                  <span className="block text-xs text-[#555] mb-1.5">{field.description}</span>
                  {field.multiline ? (
                    <textarea
                      name={field.name}
                      rows={3}
                      placeholder={field.placeholder}
                      value={values[field.name]}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      className={`${inputClass} resize-y`}
                    />
                  ) : (
                    <input
                      type="text"
                      name={field.name}
                      placeholder={field.placeholder}
                      value={values[field.name]}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {fieldErrors[field.name] && (
                    <span className="block text-xs text-[#cf222e] mt-1">{fieldErrors[field.name]}</span>
                  )}
                </label>
              ))}
              <Button type="submit">Run Workflow</Button>
            </form>
          )}

          {status === "running" && <Button disabled>Running\u2026</Button>}
          {status === "done" && (
            <p className="text-[#1a7f37] font-semibold text-sm">\u2713 Workflow completed successfully.</p>
          )}
          {status === "error" && (
            <p className="text-[#cf222e] font-semibold text-sm mt-3">\u2717 Workflow failed. See log above.</p>
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
        </>
      )}

      {tab === "progress" && (
        <>
          {campaignStatuses.length > 0
            ? (
              <CampaignStatusPanel
                statuses={campaignStatuses}
                selectedCampaign={selectedCampaign}
                onSelectCampaign={setSelectedCampaign}
              />
            )
            : <p className="text-sm text-[#555]">No campaign data available.</p>}
          {selectedCampaign && (
            <CampaignActions
              openIssueCount={openIssueCounts[selectedCampaign] ?? 0}
              onGenerateIssues={async () => {
                const res = await fetch(`/run-judge?token=${encodeURIComponent(token)}`);
                if (!res.ok) {
                  const body = await res.json().catch(() => ({})) as { error?: string };
                  throw new Error(body.error ?? `Request failed: ${res.status}`);
                }
              }}
              onFixIssues={async () => {
                const res = await fetch(`/run-fixer?token=${encodeURIComponent(token)}`);
                if (!res.ok) {
                  const body = await res.json().catch(() => ({})) as { error?: string };
                  throw new Error(body.error ?? `Request failed: ${res.status}`);
                }
              }}
              issuesUrl={`https://github.com/${targetRepo}/issues?q=is:open+label:${encodeURIComponent(selectedCampaign)}`}
              pullsUrl={`https://github.com/${targetRepo}/pulls?q=is:open+label:${encodeURIComponent(selectedCampaign)}`}
            />
          )}
          <CampaignItemsTable
            items={catalog[selectedCampaign ?? ""] ?? []}
            selectedCampaign={selectedCampaign}
          />
        </>
      )}
    </div>
    </TooltipProvider>
  );
}