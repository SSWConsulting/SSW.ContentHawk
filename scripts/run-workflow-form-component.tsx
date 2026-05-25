import React, { useState, useEffect } from "react";
import { cn } from "./lib/utils";
import { Button } from "./components/ui/button";
import { CampaignStatusPanel, CampaignStatus } from "./components/campaign-status-panel";
import { CampaignItemsTable } from "./components/campaign-items-table";
import { CampaignActions } from "./components/campaign-actions";
import { Check, X } from 'lucide-react';
import { Spinner } from "./components/spinner";
import { OutboundLink } from "./components/outbound-link";

import { TooltipProvider } from "./components/ui/tooltip";
import { FormInput, FormTextarea } from "./components/form-controls";
import { Card, CardContent } from "./components/ui/card";
import { fetchCampaignStatuses, fetchCampaignItems, fetchOpenIssueCounts } from "./services/contenthawk-service";
import type { ResolvedCatalog } from "./types";
import { SseLog, type LogEvent } from "./components/sse-log";

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
  className?: string;
  children: React.ReactNode;
}

function PageShell({ className, children }: PageShellProps) {
  return (
    <>
      <div className="absolute inset-0 bg-cover -z-1 bg-[url('/polygon-bg.svg')] mix-blend-color-burn opacity-35" aria-hidden="true" />
      <TooltipProvider>
        
          {children}
        
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
  const [prUrl, setPrUrl] = useState<string | null>(null);
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
    es.addEventListener("done", async (e: Event) => {
      es.close();
      setStatus("done");
      const data = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data) as { runId?: string } : {};
      if (data.runId) {
        try {
          const prRes = await fetch(`/github/pr-for-run?token=${encodeURIComponent(token)}&run_id=${encodeURIComponent(data.runId)}`);
          if (prRes.ok) {
            const prData = await prRes.json() as { url: string | null };
            if (prData.url) setPrUrl(prData.url);
          }
        } catch { /* best-effort */ }
      }
      setTimeout(() => fetch("/kill", { method: "POST" }), 30000);
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
    <PageShell>
      <Card className="max-w-xl mx-auto my-16">
        <CardContent>
          <h1 className="text-xl mb-0 text-foreground">New Campaign</h1>
          <p className="text-muted-foreground font-mono mt-1 pb-6 text-sm">{targetRepo}</p>
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

      {status === "running" && <Button disabled> Running <Spinner /></Button>}
      {status === "done" && (
        <div className="flex flex-col gap-2">
          <p className="text-green-500 font-semibold text-sm flex items-center gap-1"><Check className="size-4" /> Workflow completed successfully.</p>
          {prUrl && <OutboundLink href={prUrl}>View generated PR</OutboundLink>}
        </div>
      )}
      {status === "error" && (
        <p className="text-destructive flex items-center font-semibold text-sm mt-3"><X /> Workflow failed. See log above.</p>
      )}

      <SseLog entries={log} className="mt-4 max-h-64" />
        </CardContent>
      </Card>
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
    fetchCampaignStatuses(token).then((statuses) => {
      setCampaignStatuses(statuses);
      if (statuses.length > 0) setSelectedCampaign(statuses[0].name);
    });
    fetchCampaignItems(token).then(setCatalog);
    fetchOpenIssueCounts(token).then(setOpenIssueCounts);
  }, [token]);

  return (
    <PageShell className="">
      <Card className="max-w-7xl mx-auto my-16">
        <CardContent className="grid grid-cols-2 gap-6">
          <div className="col-span-2">
            <h1 className="text-xl mb-0 text-foreground">Campaigns</h1>
            <p className="text-muted-foreground font-mono mt-1 text-sm col-span-2">{targetRepo}</p>
          </div>
          
            {campaignStatuses.length > 0
              ? (
                <CampaignStatusPanel
                  statuses={campaignStatuses}
                  selectedCampaign={selectedCampaign}
                  onSelectCampaign={setSelectedCampaign}
                  className="col-span-1 mb-0"
                />
              )
              : <p className="text-sm text-muted-foreground col-span-1">No campaign data available.</p>}
            <CampaignActions
              openIssueCount={openIssueCounts[selectedCampaign ?? ""] ?? 0}
              judgeStreamUrl={`/run-judge?token=${encodeURIComponent(token)}`}
              fixerStreamUrl={`/run-fixer?token=${encodeURIComponent(token)}`}
              issuesUrl={`https://github.com/${targetRepo}/issues?q=is:open+label:${encodeURIComponent(selectedCampaign ?? "")}`}
              pullsUrl={`https://github.com/${targetRepo}/pulls?q=is:open+label:${encodeURIComponent(selectedCampaign ?? "")}`}
              className="col-span-1 mt-0"
            />
            <CampaignItemsTable
              items={catalog[selectedCampaign ?? ""] ?? []}
              selectedCampaign={selectedCampaign}
              targetRepo={targetRepo}
              className="col-span-2 mt-0"
            />
          
        </CardContent>
      </Card>
    </PageShell>
  );
}