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
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs/promises";
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
): Promise<string> {
  onLine("Waiting for run to appear\u2026");
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setTimeout(r, 2000));
    const result = spawnSync(
      "gh",
      [
        "run",
        "list",
        "--workflow",
        CONTENTHAWK_WORKFLOW_FILE,
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

function parseArgs(argv: string[]): { targetRepo: string; contentCatalog: ContentCatalog | null } {
  const targetRepo = argv[0];
  if (
    !targetRepo ||
    !targetRepo.includes("/") ||
    targetRepo.startsWith("/") ||
    targetRepo.endsWith("/")
  ) {
    die("Usage: run-workflow.ts <owner/repo> [<content-catalog-json>]");
  }

  const catalogJson = argv[1];
  if (!catalogJson) return { targetRepo, contentCatalog: null };

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

  return { targetRepo, contentCatalog: parsed as ContentCatalog };
}

async function main() {
  const { targetRepo, contentCatalog } = parseArgs(process.argv.slice(2));

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

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(renderForm(targetRepo, token, css));
    }

    if (req.method === "GET" && url.pathname === "/campaign-statuses") {
      const statuses = contentCatalog ? computeCampaignStatuses(contentCatalog) : [];
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(statuses));
    }

    if (req.method === "GET" && url.pathname === "/campaign-items") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(resolvedCatalog));
    }

    if (req.method === "GET" && url.pathname === "/open-issue-counts") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(openIssueCounts));
    }

    if (req.method === "POST" && url.pathname === "/kill") {
      process.exit(0);
    }

    if (req.method === "GET" && url.pathname === "/bundle.js") {
      res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
      return res.end(clientBundle);
    }

    if (req.method === "GET" && url.pathname === "/run-workflow-stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.flushHeaders();

      type LogEvent =
        | { type: "log"; message: string }
        | { type: "link"; message: string; url: string };
      const send = (event: LogEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      const log = (message: string) => send({ type: "log", message });
      const sendLine = (line: string) =>
        /^https?:\/\//.test(line)
          ? send({ type: "link", message: line, url: line })
          : log(line);

      const workflowFields = [
        "intent",
        "search_scope",
        "label_name",
        "processing_priority",
        "issue_preferences",
        "pr_preferences",
      ] as const;
      type WorkflowFieldName = (typeof workflowFields)[number];

      const requestFields: Partial<Record<WorkflowFieldName, string>> = {};
      for (const key of workflowFields) {
        const val = url.searchParams.get(key);
        if (val) requestFields[key] = val;
      }
      const missingFields = workflowFields.filter((f) => !requestFields[f]);
      if (missingFields.length) {
        res.write(
          `event: failed\ndata: ${JSON.stringify(`Missing required fields: ${missingFields.join(", ")}`)}\n\n`,
        );
        res.end();
        return;
      }

      try {
        const beforeMs = Date.now();
        await triggerWorkflow(targetRepo, requestFields as Record<WorkflowFieldName, string>, sendLine);
        const runId = await waitForRunId(targetRepo, beforeMs, log);
        await watchRun(runId, targetRepo, sendLine);
        res.write("event: done\ndata: {}\n\n");
      } catch (err) {
        res.write(
          `event: failed\ndata: ${JSON.stringify(err instanceof Error ? err.message : String(err))}\n\n`,
        );
      } finally {
        res.end();
      }
      return;
    }

    if (req.method === "GET" && (url.pathname === "/run-judge" || url.pathname === "/run-fixer")) {
      if (url.searchParams.get("token") !== token) {
        res.statusCode = 401;
        return res.end();
      }
      const workflowFile =
        url.pathname === "/run-judge" ? CONTENT_JUDGE_WORKFLOW_FILE : CONTENT_FIXER_WORKFLOW_FILE;
      const noop = () => {};
      try {
        const beforeMs = Date.now();
        await triggerWorkflow(targetRepo, {}, noop, workflowFile);
        const runId = await waitForRunId(targetRepo, beforeMs, noop);
        await watchRun(runId, targetRepo, noop);
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        return res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    }

    if (req.method === "GET" && url.pathname === "/github/issues") {
      if (url.searchParams.get("token") !== token) {
        res.statusCode = 401;
        return res.end();
      }
      const owner = url.searchParams.get("owner");
      const repo = url.searchParams.get("repo");
      const issueNumber = url.searchParams.get("issue_number");
      if (!owner || !repo || !issueNumber || !githubToken) {
        res.statusCode = 400;
        return res.end();
      }
      const ghRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
        { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.v3+json" } },
      );
      const data = await ghRes.json() as { state: string; state_reason?: string | null };
      res.writeHead(ghRes.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ state: data.state, state_reason: data.state_reason ?? null }));
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (typeof addr === "string" || !addr) die("Failed to bind server");
  const serverUrl = `http://127.0.0.1:${addr.port}/?token=${encodeURIComponent(token)}`;

  console.error(`Open ${serverUrl} in your browser to run the workflow.`);
  openBrowser(serverUrl);

  await new Promise<void>(() => {}); // stays alive until /kill calls process.exit
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
