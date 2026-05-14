import React, { useEffect, useState } from "react";
import { LoaderCircle, Lock, LockOpen } from "lucide-react";
import { Button } from "./components/buttons";
import { killServer, getExistingSecrets, getBranchStatus, submitSecrets, createWorkflowStream } from "./services/github-service";
import { CONTENTHAWK_INSTALL_BRANCH } from "./constants";
import { Message } from "./message";

export const SECRETS = ["TAVILY_API_KEY", "COPILOT_GITHUB_TOKEN"] as const;

export type SecretResult = "ok" | "skipped" | { error: string };

export interface FormProps {
  targetRepo: string;
  token: string;
}


export function FormContent({ targetRepo, token }: FormProps) {

  const [loadingSecrets, setLoadingSecrets] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "secrets" | "workflows">("overview");
  const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "submitted">("idle");
  const [banner, setBanner] = useState<{ variant?: "success" | "warning" | "error" | "info"; msg: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SecretResult>>({});
  type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };
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

  const tabBase = "px-4 py-2 text-sm font-semibold border-b-2 transition-colors";
  const tabActive = "border-[#0969da] text-[#0969da]";
  const tabInactive = "border-transparent text-[#555]";

  return (
    <div className="relative font-sans max-w-[540px] mx-auto mt-16 px-4 text-[#1a1a1a]">
      {loadingSecrets && (
        <div
          role="alert"
          aria-busy="true"
          aria-label="loading"
          className="absolute inset-0 z-10 flex items-center justify-center bg-white/70"
        >
          <LoaderCircle className="animate-spin text-[#0969da]" size={36} />
        </div>
      )}
      <h1 className="text-xl mb-0">ContentHawk Installer</h1>
      <p className="text-[#555] font-mono mt-1">{targetRepo}</p>

      <div className="flex border-b border-gray-200 mt-6 mb-6">
        <div
          role="tab"
          className={`${tabBase} ${activeTab === "overview" ? tabActive : tabInactive}`}
        >
          Overview
        </div>
        <div
          role="tab"
          className={`${tabBase} ${activeTab === "secrets" ? tabActive : tabInactive}`}
        >
          GitHub Secrets
        </div>
        <div
          role="tab"
          className={`${tabBase} ${activeTab === "workflows" ? tabActive : tabInactive} disabled:opacity-40`}
        >
          Workflows
        </div>
      </div>

      {activeTab === "overview" && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Before you begin</h2>
          <p className="text-sm text-[#555] mb-3">
            The installer will perform a shallow clone of <span className="font-mono text-gray-800 bg-gray-100 px-1 rounded">{targetRepo}</span> into your current directory and complete the installation using local git commands. The end result will be a pull request opened against the default branch with the necessary workflows added.
          </p>
          <ul className="text-sm text-[#555] mb-4 list-disc pl-5 space-y-1">
            <li>A shallow clone is created in your current working directory.</li>
            <li>An installation branch is checked out and the ContentHawk workflows are added.</li>
            <li>The branch is pushed and a pull request is opened against the default branch.</li>
          </ul>
          <p className="text-xs text-[#555] mb-4">
            Make sure your current terminal directory is where you want the clone to live before continuing.
          </p>
          <Button type="button" onClick={() => setActiveTab("secrets")}>
            Get Started →
          </Button>
        </div>
      )}

      {activeTab === "secrets" && (
        <>
          <Message variant={banner?.variant}>{banner?.msg}</Message>
          <form onSubmit={handleSubmit}>
            {SECRETS.map((name) => {
              const s = statuses[name];
              const statusClass = s === "ok" ? " ok" : s === "skipped" ? " warn" : s && typeof s === "object" ? " err" : "";
              const statusText = s === "ok" ? "\u2713 Set" : s === "skipped" ? "\u26a0 Skipped (empty)" : s && typeof s === "object" ? `\u2717 ${s.error}` : "";
              return (
                <label key={name} className="block my-5">
                  <span className="block font-semibold mb-1.5 font-mono text-[0.9rem]">{name}</span>
                  {name === "TAVILY_API_KEY" && (
                    <span className="block text-xs text-[#555] mb-1.5">
                      Get a production API key from <a href="https://www.tavily.com/?" target="_blank" rel="noopener noreferrer" className="text-[#0969da] underline">tavily.com</a>.
                    </span>
                  )}
                  {name === "COPILOT_GITHUB_TOKEN" && (
                    <span className="block text-xs text-[#555] mb-1.5">
                      Create a personal access token at <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer" className="text-[#0969da] underline">github.com/settings/personal-access-tokens</a> with the permission <span className="font-mono text-gray-800 bg-gray-100 px-1 rounded">Copilot Requests: Readonly</span>.
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
                      value={s === "ok" && !unlockedFields.has(name) ? "••••••••••••" : undefined}
                      className="w-full py-[0.55rem] px-[0.65rem] pr-9 font-mono border border-[#ccc] rounded box-border text-[0.95rem] disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
                      >
                        {unlockedFields.has(name) ? <LockOpen size={15} /> : <Lock size={15} />}
                      </button>
                    )}
                  </div>
                  <span className={`status${statusClass}`}>{statusText}</span>
                </label>
              );
            })}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={submitting || submissionState === "submitted" || SECRETS.every(n => statuses[n] === "ok" && !unlockedFields.has(n))}>
                Submit
              </Button>
              {(submissionState === "submitted" || SECRETS.every(n => statuses[n] === "ok" && !unlockedFields.has(n))) && (
                <Button variant="green" type="button" onClick={() => setActiveTab("workflows")}>
                  Next: Set up Workflows →
                </Button>
              )}
            </div>
          </form>
        </>
      )}

      {activeTab === "workflows" && (
        <div>
          <h2 className="text-lg font-semibold mb-1">ContentHawk Workflows</h2>
          <p className="text-sm text-[#555] mb-4">
            Copy GitHub Actions workflows from SSWConsulting/SSW.ContentHawk into this repo and open a pull request.
          </p>
          {workflowStatus === "running" ? (
            <Button disabled>Setting up…</Button>
          ) : branchStatus === "checking" ? (
            <p className="text-sm text-[#555]">Checking installation status…</p>
          ) : branchStatus === "exists" && workflowStatus !== "done" && workflowStatus !== "no-changes" ? (
            <>
              <Message variant="info">An installation branch already exists: {CONTENTHAWK_INSTALL_BRANCH}.</Message>
              <Button variant="secondary" type="button" onClick={() => startWorkflow(true)}>Restart Installation</Button>
            </>
          ) : workflowStatus !== "done" && workflowStatus !== "no-changes" ? (
            <Button type="button" onClick={() => startWorkflow(false)}>Set up Workflows</Button>
          ) : null}
          {workflowLog.length > 0 && (
            <div className="mt-4 text-xs bg-gray-50 border border-gray-200 rounded p-3 max-h-48 overflow-y-auto font-mono">
              {workflowLog.map((entry, i) =>
                
                  <span key={i} className="block whitespace-pre-wrap">{entry.message}</span>
                
              )}
            </div>
          )}
          {(workflowStatus === "done" || workflowStatus === "no-changes") && (
            <p className="mt-2 text-sm text-[#555]">
              The CLI has finished — you can safely close this tab.
            </p>
          )}
          { (workflowStatus === "done" )  && (
            <>
              <p className="mt-2 text-sm font-semibold">
                <span className="text-[#1a7f37]">✓ Pull request created successfully.{" "}</span>
                {prUrl && <a role="link" href={prUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{prUrl}</a>}
              </p>
      
            </>
          )}
          {workflowStatus === "no-changes" && (
            <div className="mt-4">
              <Message variant="info">
                No changes to commit — is ContentHawk workflows already match what's on your default branch.
              </Message>
            </div>
          )}
          {workflowStatus === "error" && (
            <p className="text-[#cf222e] mt-2 text-sm font-semibold">✗ Setup failed. See log above.</p>
          )}
        </div>
      )}
    </div>
  );
}
