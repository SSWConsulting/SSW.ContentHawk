import React, { useEffect, useState } from "react";
import { LoaderCircle, Lock, LockOpen, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import { cn } from "./lib/utils";
import { killServer, getExistingSecrets, getBranchStatus, submitSecrets, createWorkflowStream } from "./services/github-service";
import { CONTENTHAWK_INSTALL_BRANCH } from "./constants";
import { SseLog, type LogEvent } from "./components/sse-log";
import { OutboundLink } from "./components/outbound-link";

export const SECRETS = ["TAVILY_API_KEY", "COPILOT_GITHUB_TOKEN"] as const;

export type SecretResult = "ok" | "skipped" | { error: string };

export interface FormProps {
  targetRepo: string;
  token: string;
}

type BannerVariant = "success" | "warning" | "error" | "info";

function Banner({ variant, children }: { variant?: BannerVariant; children?: React.ReactNode }) {
  if (!variant || !children) return null;
  const classes: Record<BannerVariant, string> = {
    info: "bg-blue-950/50 border-blue-500/50 text-blue-100",
    success: "bg-green-950/50 border-green-500/50 text-green-100",
    error: "bg-destructive/20 border-destructive text-foreground",
    warning: "bg-yellow-950/50 border-yellow-500/50 text-yellow-100",
  };
  return (
    <div className={cn("px-3 py-2 rounded border my-4 text-sm", classes[variant])}>
      {children}
    </div>
  );
}

export function FormContent({ targetRepo, token }: FormProps) {
  const [loadingSecrets, setLoadingSecrets] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "secrets" | "workflows">("overview");
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [banner, setBanner] = useState<{ variant?: BannerVariant; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SecretResult>>({});
  const [workflowStatus, setWorkflowStatus] = useState<"idle" | "running" | "done" | "error" | "no-changes">("idle");
  const [workflowLog, setWorkflowLog] = useState<LogEvent[]>([]);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [branchStatus, setBranchStatus] = useState<"checking" | "exists" | "clear">("checking");
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    getExistingSecrets(token)
      .then((existing) => {
        const pre: Record<string, SecretResult> = {};
        for (const name of existing) pre[name] = "ok";
        setStatuses(pre);
      })
      .catch(() => {})
      .finally(() => setLoadingSecrets(false));
  }, []);

  useEffect(() => {
    getBranchStatus(token)
      .then((exists) => setBranchStatus(exists ? "exists" : "clear"))
      .catch(() => setBranchStatus("clear"));
  }, []);

  function startWorkflow(restart = false) {
    setWorkflowStatus("running");
    setWorkflowLog([]);
    const es = createWorkflowStream(token, restart);
    es.addEventListener("message", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as LogEvent;
      setWorkflowLog(prev => [...prev, event]);
      if (event.type === "link") setPrUrl(event.url);
    });
    es.addEventListener("done", () => {
      es.close();
      setWorkflowStatus("done");
      setBranchStatus("exists");
      killServer();
    });
    es.addEventListener("no-changes", () => {
      es.close();
      setWorkflowStatus("no-changes");
      killServer();
    });
    es.addEventListener("failed", (e: Event) => {
      es.close();
      setWorkflowStatus("error");
      const msg = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data) as string : "Unknown error";
      setWorkflowLog(prev => [...prev, { type: "log", message: `Error: ${msg}` }]);
    });
    es.onerror = () => {
      if (es.readyState !== EventSource.CLOSED) {
        es.close();
        setWorkflowStatus("error");
        setWorkflowLog(prev => [...prev, { type: "log", message: "Connection lost" }]);
      }
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setBanner({ msg: "Submitting\u2026" });
    try {
      const data = new URLSearchParams(new FormData(e.currentTarget) as unknown as Record<string, string>);
      const results = await submitSecrets(token, data);
      setStatuses(results);
      const failed = Object.values(results).filter(
        (r: unknown) => r && typeof r === "object" && "error" in r,
      ).length;
      if (failed > 0) {
        setBanner({ variant: "error", msg: "Some secrets failed. You can re-enter and submit again, or close this tab." });
        setSubmitting(false);
      } else {
        setBanner({ variant: "success", msg: "Done. You can safely close this tab \u2014 and resume the installation in your terminal." });
        setSubmissionState("submitted");
      }
    } catch (err) {
      setBanner({ variant: "error", msg: `Submission failed: ${err instanceof Error ? err.message : String(err)}. You can safely close this tab.` });
      setSubmitting(false);
    }
  }

  return (
    <Card className="relative max-w-[540px] mx-auto my-16">
      <CardContent>
        {loadingSecrets && (
          <div
            role="alert"
            aria-busy="true"
            aria-label="loading"
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/70"
          >
            <LoaderCircle className="animate-spin text-primary" size={36} />
          </div>
        )}
        <h1 className="text-xl mb-0 text-foreground">ContentHawk Installer</h1>
        <p className="text-muted-foreground font-mono mt-1">{targetRepo}</p>

        <div className="flex border-b border-border mt-6 mb-6">
          {(["overview", "secrets", "workflows"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              
              className={cn(
                "px-4 py-2 text-sm font-semibold border-b-2 transition-colors",
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {tab === "overview" ? "Overview" : tab === "secrets" ? "GitHub Secrets" : "Workflows"}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div>
            <h2 className="text-lg font-semibold mb-2 text-foreground">Before you begin</h2>
            <p className="text-sm text-muted-foreground mb-3">
              The installer will perform a shallow clone of{" "}
              <span className="font-mono text-foreground bg-muted px-1 rounded">{targetRepo}</span>{" "}
              into your current directory and complete the installation using local git commands. The end result will be a pull request opened against the default branch with the necessary workflows added.
            </p>
            <ul className="text-sm text-muted-foreground mb-4 list-disc pl-5 space-y-1">
              <li>A shallow clone is created in your current working directory.</li>
              <li>An installation branch is checked out and the ContentHawk workflows are added.</li>
              <li>The branch is pushed and a pull request is opened against the default branch.</li>
            </ul>
            <p className="text-xs text-muted-foreground mb-4">
              Make sure your current terminal directory is where you want the clone to live before continuing.
            </p>
            <Button type="button" onClick={() => setActiveTab("secrets")}>
              Get Started →
            </Button>
          </div>
        )}

        {activeTab === "secrets" && (
          <>
            <Banner variant={banner?.variant}>{banner?.msg}</Banner>
            <form onSubmit={handleSubmit}>
              {SECRETS.map((name) => {
                const s = statuses[name];
                const statusNode = s === "ok"
                  ? <span className="flex items-center gap-1 text-xs mt-1 text-muted-foreground"><Check className="size-3 text-green-500 shrink-0" /> Set</span>
                  : s === "skipped"
                  ? <span className="flex items-center gap-1 text-xs mt-1 text-muted-foreground"><AlertTriangle className="size-3 text-yellow-500 shrink-0" /> Skipped (empty)</span>
                  : s && typeof s === "object"
                  ? <span className="flex items-center gap-1 text-xs mt-1 text-muted-foreground"><X className="size-3 text-destructive shrink-0" /> {s.error}</span>
                  : null;
                return (
                  <label key={name} className="block my-5">
                    <span className="block font-semibold mb-1.5 font-mono text-[0.9rem]">{name}</span>
                    {name === "TAVILY_API_KEY" && (
                      <span className="block text-xs text-muted-foreground mb-1.5">
                        Get a production API key from{" "}
                        <a href="https://www.tavily.com/?" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          tavily.com
                        </a>
                        .
                      </span>
                    )}
                    {name === "COPILOT_GITHUB_TOKEN" && (
                      <span className="block text-xs text-muted-foreground mb-1.5">
                        Create a personal access token at{" "}
                        <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          github.com/settings/personal-access-tokens
                        </a>{" "}
                        with the permission{" "}
                        <span className="font-mono text-foreground bg-muted px-1 rounded">Copilot Requests: Readonly</span>.
                      </span>
                    )}
                    <div className="relative">
                      <input
                        key={`${name}-${unlockedFields.has(name) ? "unlocked" : "locked"}`}
                        type="password"
                        name={name}
                        autoComplete="new-password"
                        disabled={s === "ok" && !unlockedFields.has(name)}
                        readOnly={s === "ok" && !unlockedFields.has(name)}
                        value={s === "ok" && !unlockedFields.has(name) ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : undefined}
                        className="w-full py-[0.55rem] px-[0.65rem] pr-9 font-mono border border-border rounded box-border text-[0.95rem] bg-background text-foreground disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
                      />
                      {s === "ok" && (
                        <button
                          type="button"
                          aria-label={unlockedFields.has(name) ? "Lock field" : "Unlock to override"}
                          title={unlockedFields.has(name) ? "Lock field" : "Unlock to override"}
                          onClick={() => {
                            const isCurrentlyLocked = !unlockedFields.has(name);
                            setUnlockedFields((prev) => {
                              const next = new Set(prev);
                              if (next.has(name)) next.delete(name);
                              else next.add(name);
                              return next;
                            });
                            if (isCurrentlyLocked) setSubmissionState("idle");
                          }}
                          disabled={submissionState === "submitted"}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {unlockedFields.has(name) ? <LockOpen size={15} /> : <Lock size={15} />}
                        </button>
                      )}
                    </div>
                    {statusNode}
                  </label>
                );
              })}
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={submitting || submissionState === "submitted" || SECRETS.every(n => statuses[n] === "ok" && !unlockedFields.has(n))}
                >
                  Submit
                </Button>
                {(submissionState === "submitted" || SECRETS.every(n => statuses[n] === "ok" && !unlockedFields.has(n))) && (
                  <Button variant="secondary" type="button" onClick={() => setActiveTab("workflows")}>
                    Next: Set up Workflows →
                  </Button>
                )}
              </div>
            </form>
          </>
        )}

        {activeTab === "workflows" && (
          <div>
            <h2 className="text-lg font-semibold mb-1 text-foreground">ContentHawk Workflows</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Copy GitHub Actions workflows from SSWConsulting/SSW.ContentHawk into this repo and open a pull request.
            </p>
            {workflowStatus === "running" ? (
              <Button disabled>Setting up…</Button>
            ) : branchStatus === "checking" ? (
              <p className="text-sm text-muted-foreground">Checking installation status…</p>
            ) : branchStatus === "exists" && workflowStatus !== "done" && workflowStatus !== "no-changes" ? (
              <>
                <Banner variant="info">An installation branch already exists: {CONTENTHAWK_INSTALL_BRANCH}.</Banner>
                <Button variant="default" type="button" onClick={() => startWorkflow(true)}>Restart Installation</Button>
              </>
            ) : workflowStatus !== "done" && workflowStatus !== "no-changes" ? (
              <Button type="button" onClick={() => startWorkflow(false)}>Set up Workflows</Button>
            ) : null}
            <SseLog entries={workflowLog} className="mt-4" />
            {(workflowStatus === "done" || workflowStatus === "no-changes") && (
              <p className="mt-2 text-sm text-muted-foreground">
                The CLI has finished — you can safely close this tab.
              </p>
            )}
            {workflowStatus === "done" && (
              <div className="mt-2 flex flex-col gap-2">
                <p className="text-sm font-semibold text-foreground flex items-center gap-1"><Check className="size-4 text-green-500 shrink-0" /> Pull request created successfully.</p>
                {prUrl && <OutboundLink href={prUrl}>View generated PR</OutboundLink>}
              </div>
            )}
            
            {workflowStatus === "no-changes" && (
              <div className="mt-4">
                <Banner variant="info">
                  No changes to commit — ContentHawk workflows already match what&apos;s on your default branch.
                </Banner>
              </div>
            )}
            {workflowStatus === "error" && (
              <p className="text-foreground mt-2 text-sm font-semibold flex items-center gap-1"><X className="size-4 text-destructive shrink-0" /> Setup failed. See log above.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}