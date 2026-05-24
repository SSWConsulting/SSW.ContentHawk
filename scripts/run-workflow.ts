#!/usr/bin/env -S npx tsx
/**
 * SSW env installer — ContentHawk workflow runner.
 *
 * Spins up a one-shot HTTP server on 127.0.0.1:<random>, opens a browser,
 * triggers the content-campaign.lock.yml workflow on the target repo via the
 * GitHub CLI, and streams live run status back to the browser via SSE.
 *
 * Usage: run-workflow.ts <owner/repo>
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import express from "express";
import type { Request, Response } from "express";
import { renderForm } from "./run-workflow-form.tsx";
import { CONTENTHAWK_WORKFLOW_FILE, CONTENT_JUDGE_WORKFLOW_FILE, CONTENT_FIXER_WORKFLOW_FILE } from "./constants.ts";
import type { ContentCatalog, ResolvedCatalog, ResolvedItem } from "./types.ts";

async function bundleClient(): Promise<string> {
  const entry = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "run-workflow-client.tsx",
  );
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    minify: true,
  });
  return result.outputFiles[0].text;
}

async function buildCSS(): Promise<string> {
  const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "form.css");
  const input = await fs.readFile(cssPath, "utf-8");
  const result = await postcss([tailwindcss]).process(input, { from: cssPath });
  return result.css;
}

function die(msg: string, code = 1): never {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

async function resolveCatalog(
  catalog: ContentCatalog,
  targetRepo: string,
  githubToken: string,
): Promise<{ resolved: ResolvedCatalog; openIssueCounts: Record<string, number> }> {
  const [owner, repo] = targetRepo.split("/");

  type IssueApiResult = { state: string; state_reason: string | null };
  type Task = { campaign: string; index: number; issueNumber: number };

  const tasks: Task[] = [];
  for (const [campaign, items] of Object.entries(catalog)) {
    for (let i = 0; i < items.length; i++) {
      if (typeof items[i].checkResult === "number") {
        tasks.push({ campaign, index: i, issueNumber: items[i].checkResult as number });
      }
    }
  }

  const fetchResult = async (issueNumber: number): Promise<IssueApiResult | null> => {
    if (!githubToken) return null;
    try {
      const r = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } },
      );
      return r.ok ? (r.json() as Promise<IssueApiResult>) : null;
    } catch {
      return null;
    }
  };

  const stateResults = await Promise.all(tasks.map((t) => fetchResult(t.issueNumber)));
  const stateMap = new Map<string, IssueApiResult | null>();
  for (let i = 0; i < tasks.length; i++) {
    stateMap.set(`${tasks[i].campaign}:${tasks[i].index}`, stateResults[i]);
  }

  const resolved: ResolvedCatalog = {};
  const openIssueCounts: Record<string, number> = {};

  for (const [campaign, items] of Object.entries(catalog)) {
    let openCount = 0;
    resolved[campaign] = items.map((item, index): ResolvedItem => {
      const { path, lastUpdated, checkedDate, categoryList, createdDate } = item;
      const base = { path, lastUpdated, checkedDate, categoryList, createdDate };
      if (typeof item.checkResult === "number") {
        const issueNumber = item.checkResult;
        const state = stateMap.get(`${campaign}:${index}`);
        if (!state || state.state === "open") {
          openCount++;
          return { __typename: "open_issue", ...base, issueNumber };
        }
        return { __typename: "closed_issue", ...base, issueNumber, stateReason: state.state_reason };
      }
      if (item.checkResult === "skipped") return { __typename: "skipped", ...base };
      return { __typename: "pending", ...base };
    });
    openIssueCounts[campaign] = openCount;
  }

  return { resolved, openIssueCounts };
}

function checkGh(): void {
  const v = spawnSync("gh", ["--version"]);
  if (v.error || v.status !== 0) {
    die("'gh' CLI is not installed. Install from https://cli.github.com");
  }
  const a = spawnSync("gh", ["auth", "status"]);
  if (a.status !== 0) {
    die("'gh' is not authenticated. Run 'gh auth login' first.");
  }
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // best-effort — user can open the URL manually
  }
}

function triggerWorkflow(
  targetRepo: string,
  fields: Record<string, string>,
  onLine: (l: string) => void,
  workflowFile: string = CONTENTHAWK_WORKFLOW_FILE,
): Promise<void> {
  return new Promise((resolve, reject) => {
    onLine(`Triggering ${workflowFile}\u2026`);
    const fieldArgs = Object.entries(fields).flatMap(([k, v]) => ["--field", `${k}=${v}`]);
    const child = spawn("gh", [
      "workflow",
      "run",
      workflowFile,
      "--repo",
      targetRepo,
      ...fieldArgs,
    ]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`gh workflow run exited ${code}`)),
    );
  });
}

async function waitForRunId(
  targetRepo: string,
  beforeMs: number,
  onLine: (l: string) => void,
  workflowFile: string = CONTENTHAWK_WORKFLOW_FILE,
): Promise<string> {
  onLine("Waiting for run to appear\u2026");
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((r) => setTimeout(r, 3000));
    const result = spawnSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        workflowFile,
        "--repo",
        targetRepo,
        "--limit",
        "1",
        "--json",
        "databaseId,createdAt",
      ],
      { encoding: "utf-8" },
    );
    if (result.status !== 0) continue;
    try {
      const runs = JSON.parse(result.stdout) as Array<{
        databaseId: number;
        createdAt: string;
      }>;
      if (runs.length && new Date(runs[0].createdAt).getTime() >= beforeMs) {
        return String(runs[0].databaseId);
      }
    } catch {
      /* retry */
    }
  }
  throw new Error("Timed out waiting for workflow run to appear");
}

function watchRun(
  runId: string,
  targetRepo: string,
  onLine: (l: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    onLine(`Watching run #${runId}\u2026`);
    const child = spawn("gh", [
      "run",
      "watch",
      runId,
      "--repo",
      targetRepo,
      "--exit-status",
    ]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`Run #${runId} failed`)),
    );
  });
}


interface CampaignStatus {
  name: string;
  percent: number;
}

function computeCampaignStatuses(catalog: ContentCatalog): CampaignStatus[] {
  return Object.entries(catalog).map(([name, items]) => {
    const done = items.filter((i) => i.checkResult !== "pending").length;
    const total = items.length;
    return { name, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  });
}

type FormMode = "new-campaign" | "campaigns";

function parseArgs(argv: string[]): { targetRepo: string; form: FormMode; contentCatalog: ContentCatalog | null } {
  const form = argv[0];
  if (form !== "new-campaign" && form !== "campaigns") {
    die("Usage: run-workflow.ts <new-campaign|campaigns> <owner/repo> [<content-catalog-json>]");
  }

  const targetRepo = argv[1];
  if (
    !targetRepo ||
    !targetRepo.includes("/") ||
    targetRepo.startsWith("/") ||
    targetRepo.endsWith("/")
  ) {
    die("Usage: run-workflow.ts <new-campaign|campaigns> <owner/repo> [<content-catalog-json>]");
  }

  const catalogJson = argv[2];
  if (!catalogJson) return { targetRepo, form, contentCatalog: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(catalogJson);
  } catch {
    die("content catalog: invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    die("content catalog: expected a JSON object");
  }

  for (const val of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(val)) die("content catalog: each entry must be an array of ContentItems");
  }

  return { targetRepo, form, contentCatalog: parsed as ContentCatalog };
}

async function main() {
  const { targetRepo, form, contentCatalog } = parseArgs(process.argv.slice(2));

  checkGh();

  const ghTokenResult = spawnSync("gh", ["auth", "token"], { encoding: "utf-8" });
  const githubToken = ghTokenResult.status === 0 ? ghTokenResult.stdout.trim() : "";

  const [{ resolved: resolvedCatalog, openIssueCounts }, clientBundle, css] = await Promise.all([
    contentCatalog
      ? resolveCatalog(contentCatalog, targetRepo, githubToken)
      : Promise.resolve({ resolved: {} as import("./types.ts").ResolvedCatalog, openIssueCounts: {} as Record<string, number> }),
    bundleClient(),
    buildCSS(),
  ]);
  const token = crypto.randomBytes(24).toString("base64url");

  type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };
  const sseLog = (res: Response, event: LogEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const sseText = (res: Response, message: string) => sseLog(res, { type: "log", message });
  const sseLine = (res: Response, line: string) =>
    /^https?:\/\//.test(line)
      ? sseLog(res, { type: "link", message: line, url: line })
      : sseText(res, line);

  function requireToken(req: Request, res: Response): boolean {
    if (req.query["token"] !== token) {
      res.sendStatus(401);
      return false;
    }
    return true;
  }

  const app = express();

  app.get("/", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderForm(targetRepo, token, css, form));
  });

  app.get("/campaign-statuses", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(contentCatalog ? computeCampaignStatuses(contentCatalog) : []);
  });

  app.get("/campaign-items", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(resolvedCatalog);
  });

  app.get("/open-issue-counts", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(openIssueCounts);
  });

  app.post("/kill", () => process.exit(0));

  app.get("/bundle.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/javascript");
    res.end(clientBundle);
  });

  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "images"), { maxAge: "1h" }));

  app.get("/run-workflow-stream", async (req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.flushHeaders();

    const workflowFields = [
      "intent", "search_scope", "label_name",
      "processing_priority", "issue_preferences", "pr_preferences",
    ] as const;
    type WorkflowFieldName = (typeof workflowFields)[number];

    const requestFields: Partial<Record<WorkflowFieldName, string>> = {};
    for (const key of workflowFields) {
      const val = req.query[key];
      if (typeof val === "string") requestFields[key] = val;
    }
    const missingFields = workflowFields.filter((f) => !requestFields[f]);
    if (missingFields.length) {
      res.write(`event: failed\ndata: ${JSON.stringify(`Missing required fields: ${missingFields.join(", ")}`)}\n\n`);
      res.end();
      return;
    }

    try {
      const beforeMs = Date.now();
      await triggerWorkflow(targetRepo, requestFields as Record<WorkflowFieldName, string>, (l) => sseLine(res, l));
      const runId = await waitForRunId(targetRepo, beforeMs, (l) => sseText(res, l));
      await watchRun(runId, targetRepo, (l) => sseLine(res, l));
      res.write(`event: done\ndata: ${JSON.stringify({ runId })}\n\n`);
    } catch (err) {
      res.write(`event: failed\ndata: ${JSON.stringify(err instanceof Error ? err.message : String(err))}\n\n`);
    } finally {
      res.end();
    }
  });

  app.get(["/run-judge", "/run-fixer"], async (req, res) => {
    if (!requireToken(req, res)) return;

    const workflowFile = req.path === "/run-judge" ? CONTENT_JUDGE_WORKFLOW_FILE : CONTENT_FIXER_WORKFLOW_FILE;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.flushHeaders();

    try {
      const beforeMs = Date.now();
      await triggerWorkflow(targetRepo, {}, (l) => sseLine(res, l), workflowFile);
      const runId = await waitForRunId(targetRepo, beforeMs, (l) => sseText(res, l), workflowFile);
      await watchRun(runId, targetRepo, (l) => sseLine(res, l));
      res.write("event: done\ndata: {}\n\n");
    } catch (err) {
      res.write(`event: failed\ndata: ${JSON.stringify(err instanceof Error ? err.message : String(err))}\n\n`);
    } finally {
      res.end();
    }
  });

  app.get("/github/pr-for-run", async (req, res) => {
    if (!requireToken(req, res)) return;
    const runId = req.query["run_id"];
    if (typeof runId !== "string" || !githubToken) { res.sendStatus(400); return; }

    const [owner, repo] = targetRepo.split("/");
    const searchRes = await fetch(
      `https://api.github.com/search/issues?q=repo:${owner}/${repo}+type:pr+"id: ${runId}"+in:body`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } },
    );
    if (!searchRes.ok) { res.sendStatus(502); return; }

    const data = await searchRes.json() as { items: Array<{ html_url: string; number: number; title: string }> };
    const pr = data.items[0] ?? null;
    res.setHeader("Cache-Control", "no-store");
    res.json({ url: pr?.html_url ?? null, number: pr?.number ?? null, title: pr?.title ?? null });
  });

  app.get("/github/issues", async (req, res) => {
    if (!requireToken(req, res)) return;
    const { owner, repo, issue_number } = req.query;
    if (typeof owner !== "string" || typeof repo !== "string" || typeof issue_number !== "string" || !githubToken) {
      res.sendStatus(400); return;
    }

    const ghRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } },
    );
    const data = await ghRes.json() as { state: string; state_reason?: string | null };
    res.status(ghRes.status).setHeader("Cache-Control", "no-store");
    res.json({ state: data.state, state_reason: data.state_reason ?? null });
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  if (typeof addr === "string" || !addr) die("Failed to bind server");
  const serverUrl = `http://127.0.0.1:${addr.port}/?token=${encodeURIComponent(token)}`;

  console.error(`Open ${serverUrl} in your browser to run the workflow.`);
  openBrowser(serverUrl);

  await new Promise<void>(() => {}); // stays alive until /kill calls process.exit
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
