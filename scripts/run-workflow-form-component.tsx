import React, { useState, useEffect } from "react";
import { Button } from "./components/ui/button";
import { CampaignStatusPanel, CampaignStatus } from "./components/campaign-status-panel";
import { CampaignItemsTable } from "./components/campaign-items-table";
import { CampaignActions } from "./components/campaign-actions";
import { TooltipProvider } from "./components/ui/tooltip";
import { FormInput, FormTextarea } from "./components/form-controls";
import { Card, CardContent } from "./components/ui/card";
import { GridPattern } from "./components/ui/grid-pattern";
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

interface PageShellProps {
  targetRepo: string;
  children: React.ReactNode;
}

function PageShell({ targetRepo, children }: PageShellProps) {
  return (
    <>    <div className="absolute inset-0 bg-cover -z-1 bg-[url('/polygon-bg.svg')] mix-blend-color-burn opacity-35" aria-hidden="true" />

    <TooltipProvider>
      
        
        <div className="relative font-sans max-w-[540px] mx-auto py-16 text-foreground">
          <Card>
            <CardContent>
              <p className="font-mono text-sm text-muted-foreground mb-4">{targetRepo}</p>
              {children}
            </CardContent>
          </Card>
        </div>
      
    </TooltipProvider>
    </>
  );
}

export interface NewCampaignPageProps {
  targetRepo: string;
  token: string;
}

export function NewCampaignPage({ targetRepo, token }: NewCampaignPageProps) {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
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

  return (
    <PageShell targetRepo={targetRepo}>
      <p className="text-sm text-muted-foreground mb-6">
        Trigger the <span className="font-mono">{CONTENTHAWK_WORKFLOW_FILE}</span> workflow on this repository.
      </p>

      {(status === "idle" || status === "error") && (
        <div className="bg-muted rounded-lg p-4">
          <form onSubmit={startRun} noValidate>
            {FIELDS.map((field) => (
              <label key={field.name} className="block my-5 first:mt-0">
                <span className="block font-semibold mb-1.5 font-mono text-[0.9rem]">{field.label}</span>
                <span className="block text-xs text-muted-foreground mb-1.5">{field.description}</span>
                {field.multiline ? (
                  <FormTextarea
                    name={field.name}
                    rows={3}
                    placeholder={field.placeholder}
                    value={values[field.name]}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className="resize-y font-mono"
                  />
                ) : (
                  <FormInput
                    type="text"
                    name={field.name}
                    placeholder={field.placeholder}
                    value={values[field.name]}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    className="font-mono"
                  />
                )}
                {fieldErrors[field.name] && (
                  <span className="block text-xs text-destructive mt-1">{fieldErrors[field.name]}</span>
                )}
              </label>
            ))}
            <div className="flex justify-end mt-2">
              <Button size="lg" type="submit">Run Workflow</Button>
            </div>
          </form>
        </div>
      )}

      {status === "running" && <Button disabled>Running\u2026</Button>}
      {status === "done" && (
        <p className="text-green-500 font-semibold text-sm">\u2713 Workflow completed successfully.</p>
      )}
      {status === "error" && (
        <p className="text-destructive font-semibold text-sm mt-3">\u2717 Workflow failed. See log above.</p>
      )}

      {log.length > 0 && (
        <div className="mt-4 text-xs bg-card border border-border rounded p-3 max-h-64 overflow-y-auto font-mono">
          {log.map((entry, i) =>
            entry.type === "link" ? (
              <a key={i} href={entry.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline whitespace-pre-wrap">
                {entry.message}
              </a>
            ) : (
              <span key={i} className="block whitespace-pre-wrap text-muted-foreground">
                {entry.message}
              </span>
            ),
          )}
        </div>
      )}
    </PageShell>
  );
}

export interface CampaignsPageProps {
  targetRepo: string;
  token: string;
}

export function CampaignsPage({ targetRepo, token }: CampaignsPageProps) {
  const [campaignStatuses, setCampaignStatuses] = useState<CampaignStatus[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ResolvedCatalog>({});
  const [openIssueCounts, setOpenIssueCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchCampaignStatuses(token).then(setCampaignStatuses);
    fetchCampaignItems(token).then(setCatalog);
    fetchOpenIssueCounts(token).then(setOpenIssueCounts);
  }, [token]);

  return (
    <PageShell targetRepo={targetRepo}>
      {campaignStatuses.length > 0
        ? (
          <CampaignStatusPanel
            statuses={campaignStatuses}
            selectedCampaign={selectedCampaign}
            onSelectCampaign={setSelectedCampaign}
          />
        )
        : <p className="text-sm text-muted-foreground">No campaign data available.</p>}
      {selectedCampaign && (
        <CampaignActions
          openIssueCount={openIssueCounts[selectedCampaign] ?? 0}
          judgeStreamUrl={`/run-judge?token=${encodeURIComponent(token)}`}
          fixerStreamUrl={`/run-fixer?token=${encodeURIComponent(token)}`}
          issuesUrl={`https://github.com/${targetRepo}/issues?q=is:open+label:${encodeURIComponent(selectedCampaign)}`}
          pullsUrl={`https://github.com/${targetRepo}/pulls?q=is:open+label:${encodeURIComponent(selectedCampaign)}`}
        />
      )}
      <CampaignItemsTable
        items={catalog[selectedCampaign ?? ""] ?? []}
        selectedCampaign={selectedCampaign}
      />
    </PageShell>
  );
}