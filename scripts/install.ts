#!/usr/bin/env -S npx tsx
/**
 * SSW ContentHawk CLI.
 *
 * Modes:
 *   install      <owner/repo>                          — set secrets and install workflows via PR
 *   new-campaign <owner/repo>                          — trigger a new content campaign workflow
 *   campaigns    <owner/repo> [<content-catalog-json>] — manage existing campaigns
 *
 * Spins up an Express server on 127.0.0.1:<random>, opens a browser, and
 * serves the appropriate UI.
 */

import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import express from "express";
import type { Response } from "express";
import { SECRETS, renderForm } from "./form.tsx";
import {
  CONTENTHAWK_INSTALL_BRANCH,
  CONTENTHAWK_WORKFLOW_FILE,
  CONTENT_JUDGE_WORKFLOW_FILE,
  CONTENT_FIXER_WORKFLOW_FILE,
} from "./constants.ts";
import type { ContentCatalog, ResolvedCatalog, ResolvedItem } from "./types.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

type SecretResult = "ok" | "skipped" | { error: string };
type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };
type Mode = "install" | "new-campaign" | "campaigns";
interface CampaignStatus { name: string; percent: number; }

// ─── Shared utilities ────────────────────────────────────────────────────────

const __dir = path.dirname(fileURLToPath(import.meta.url));

async function bundleClient(entryFile: string): Promise<string> {
  const result = await build({
    entryPoints: [path.join(__dir, entryFile)],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    minify: true,
  });
  return result.outputFiles[0].text;
}

async function buildCSS(): Promise<string> {
  const cssPath = path.join(__dir, "form.css");
  const input = await fs.readFile(cssPath, "utf-8");
  const result = await postcss([tailwindcss]).process(input, { from: cssPath });
  return result.css;
}

function die(msg: string, code = 1): never {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
}

function checkGh(): void {
  const v = spawnSync("gh", ["--version"]);
  if (v.error || v.status !== 0) die("'gh' CLI is not installed. Install from https://cli.github.com");
  const a = spawnSync("gh", ["auth", "status"]);
  if (a.status !== 0) die("'gh' is not authenticated. Run 'gh auth login' first.");
}

function openBrowser(url: string): void {
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" }).unref();
    } 
    else {
        spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // best-effort — user can open the URL manually
  }
}

// ─── Install-mode helpers ────────────────────────────────────────────────────

function checkBranchExists(targetRepo: string): boolean {
  const [owner, repo] = targetRepo.split("/");
  return spawnSync("gh", ["api", `repos/${owner}/${repo}/branches/${CONTENTHAWK_INSTALL_BRANCH}`], { stdio: "pipe" }).status === 0;
}

function closePRsForBranch(targetRepo: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const list = spawnSync("gh", ["pr", "list", "--repo", targetRepo, "--head", CONTENTHAWK_INSTALL_BRANCH, "--json", "number"], { encoding: "utf-8" });
    let prs: Array<{ number: number }> = [];
    try { prs = JSON.parse(list.stdout ?? "[]"); } catch { /* no PRs */ }
    if (!prs.length) { resolve(); return; }
    let pending = prs.length;
    let failed = false;
    for (const pr of prs) {
      onLine(`Closing PR #${pr.number}\u2026`);
      const child = spawn("gh", ["pr", "close", String(pr.number), "--repo", targetRepo]);
      child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
      child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
      child.on("error", (err) => { if (!failed) { failed = true; reject(err); } });
      child.on("close", (code) => {
        if (code !== 0 && !failed) { failed = true; reject(new Error(`gh pr close exited ${code}`)); }
        else if (--pending === 0 && !failed) resolve();
      });
    }
  });
}

function deleteBranch(targetRepo: string, onLine: (l: string) => void): Promise<void> {
  const [owner, repo] = targetRepo.split("/");
  return new Promise((resolve, reject) => {
    onLine(`Deleting branch ${CONTENTHAWK_INSTALL_BRANCH}\u2026`);
    const child = spawn("gh", ["api", "--method", "DELETE", `repos/${owner}/${repo}/git/refs/heads/${CONTENTHAWK_INSTALL_BRANCH}`]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Delete branch exited ${code}`))));
  });
}

function sparseClone(repoRef: string, destDir: string, paths: string[], onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["repo", "clone", repoRef, destDir, "--", "--filter=blob:none", "--no-checkout", "--sparse"]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(`gh repo clone exited ${code}`)); return; }
      gitRun(["sparse-checkout", "set", ...paths], destDir, onLine)
        .then(() => gitRun(["checkout"], destDir, onLine))
        .then(resolve)
        .catch(reject);
    });
  });
}

function compileWorkflows(cwd: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["aw", "compile"], { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gh aw compile exited ${code}`))));
  });
}

function gitRun(args: string[], cwd: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`git ${args[0]} exited ${code}`))));
  });
}

function createPR(targetRepo: string, _branch: string, cwd: string, onLine: (l: string) => void): Promise<void> {
  const body = [
    "## \uD83E\uDD85 ContentHawk Installation",
    "",
    "This pull request installs [ContentHawk](https://github.com/SSWConsulting/SSW.ContentHawk) into this repository.",
    "",
    "### What's included",
    "- `.github/workflows/` \u2014 ContentHawk GitHub Actions workflows",
    "- `.github/actions/guard-open-pr/` \u2014 supporting composite action",
    "- `.contenthawk-version` \u2014 pinned ContentHawk version for this repo",
    "",
    "### Source",
    "Files were copied from [SSWConsulting/SSW.ContentHawk](https://github.com/SSWConsulting/SSW.ContentHawk) and compiled with `gh aw compile`.",
    "",
    "### Next steps",
    "Review the changes, then merge to enable ContentHawk on this repo.",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["pr", "create", "--title", "\uD83E\uDD85 Installing ContentHawk", "--body", body, "--repo", targetRepo], { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gh pr create exited ${code}`))));
  });
}

function getExistingSecrets(targetRepo: string): Set<string> {
  const result = spawnSync("gh", ["secret", "list", "--repo", targetRepo, "--json", "name"], { encoding: "utf-8" });
  if (result.status !== 0) return new Set();
  try {
    return new Set((JSON.parse(result.stdout) as Array<{ name: string }>).map((s) => s.name));
  } catch { return new Set(); }
}

function setSecret(targetRepo: string, name: string, value: string): Promise<SecretResult> {
  if (!value.trim()) return Promise.resolve("skipped");
  return new Promise((resolve) => {
    const child = spawn("gh", ["secret", "set", name, "--repo", targetRepo, "--body", value]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => resolve({ error: err.message }));
    child.on("close", (code) => {
      if (code === 0) resolve("ok");
      else resolve({ error: stderr.trim().split("\n").pop() || `exit ${code}` });
    });
    child.stdin.end();
  });
}

// ─── Campaign-mode helpers ───────────────────────────────────────────────────

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
    } catch { return null; }
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
      const { path: p, lastUpdated, checkedDate, categoryList, createdDate } = item;
      const base = { path: p, lastUpdated, checkedDate, categoryList, createdDate };
      if (typeof item.checkResult === "number") {
        const issueNumber = item.checkResult;
        const state = stateMap.get(`${campaign}:${index}`);
        if (!state || state.state === "open") { openCount++; return { __typename: "open_issue", ...base, issueNumber }; }
        return { __typename: "closed_issue", ...base, issueNumber, stateReason: state.state_reason };
      }
      if (item.checkResult === "skipped") return { __typename: "skipped", ...base };
      return { __typename: "pending", ...base };
    });
    openIssueCounts[campaign] = openCount;
  }

  return { resolved, openIssueCounts };
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
    const child = spawn("gh", ["workflow", "run", workflowFile, "--repo", targetRepo, ...fieldArgs]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`gh workflow run exited ${code}`)));
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
    const result = spawnSync("gh", ["run", "list", "--workflow", workflowFile, "--repo", targetRepo, "--limit", "1", "--json", "databaseId,createdAt"], { encoding: "utf-8" });
    if (result.status !== 0) continue;
    try {
      const runs = JSON.parse(result.stdout) as Array<{ databaseId: number; createdAt: string }>;
      if (runs.length && new Date(runs[0].createdAt).getTime() >= beforeMs) return String(runs[0].databaseId);
    } catch { /* retry */ }
  }
  throw new Error("Timed out waiting for workflow run to appear");
}

function watchRun(runId: string, targetRepo: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    onLine(`Watching run #${runId}\u2026`);
    const child = spawn("gh", ["run", "watch", runId, "--repo", targetRepo, "--exit-status"]);
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Run #${runId} failed`)));
  });
}

function computeCampaignStatuses(catalog: ContentCatalog): CampaignStatus[] {
  return Object.entries(catalog).map(([name, items]) => {
    const done = items.filter((i) => i.checkResult !== "pending").length;
    return { name, percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100) };
  });
}

// ─── Arg parsing ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { mode: Mode; targetRepo: string; contentCatalog: ContentCatalog | null } {
  const mode = argv[0] as Mode;
  if (mode !== "install" && mode !== "new-campaign" && mode !== "campaigns") {
    die("Usage: install.ts <install|new-campaign|campaigns> <owner/repo> [<content-catalog-json>]");
  }

  const targetRepo = argv[1];
  if (!targetRepo || !targetRepo.includes("/") || targetRepo.startsWith("/") || targetRepo.endsWith("/")) {
    die("Usage: install.ts <install|new-campaign|campaigns> <owner/repo> [<content-catalog-json>]");
  }

  const catalogJson = argv[2];
  if (!catalogJson) return { mode, targetRepo, contentCatalog: null };

  let parsed: unknown;
  try { parsed = JSON.parse(catalogJson); } catch { die("content catalog: invalid JSON"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) die("content catalog: expected a JSON object");
  for (const val of Object.values(parsed as Record<string, unknown>)) {
    if (!Array.isArray(val)) die("content catalog: each entry must be an array of ContentItems");
  }

  return { mode, targetRepo, contentCatalog: parsed as ContentCatalog };
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const { mode, targetRepo, contentCatalog } = parseArgs(argv);

  checkGh();

  const ghTokenResult = spawnSync("gh", ["auth", "token"], { encoding: "utf-8" });
  const githubToken = ghTokenResult.status === 0 ? ghTokenResult.stdout.trim() : "";

  const clientEntry = mode === "install" ? "form-client.tsx" : "run-workflow-client.tsx";

  const [{ resolved: resolvedCatalog, openIssueCounts }, clientBundle, css] = await Promise.all([
    mode === "campaigns" && contentCatalog
      ? resolveCatalog(contentCatalog, targetRepo, githubToken)
      : Promise.resolve({ resolved: {} as ResolvedCatalog, openIssueCounts: {} as Record<string, number> }),
    bundleClient(clientEntry),
    buildCSS(),
  ]);

  // SSE helpers
  const sseLog = (res: Response, event: LogEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const sseText = (res: Response, message: string) => sseLog(res, { type: "log", message });
  const sseLine = (res: Response, line: string) =>
    /^https?:\/\//.test(line) ? sseLog(res, { type: "link", message: line, url: line }) : sseText(res, line);

  const app = express();
  app.use(express.urlencoded({ extended: false }));

  // ── Common routes ──────────────────────────────────────────────────────────

  app.get("/", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const html = renderForm(targetRepo, css, mode);
    res.end(html);
  });

  app.post("/kill", () => process.exit(0));

  app.get("/bundle.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/javascript");
    res.end(clientBundle);
  });

  app.use(express.static(path.join(__dir, "images"), { maxAge: "1h" }));

  // ── Install-mode routes ────────────────────────────────────────────────────

  if (mode === "install") {
    app.get("/existing-secrets", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json({ existing: [...getExistingSecrets(targetRepo)] });
    });

    app.get("/branch-status", (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.json({ exists: checkBranchExists(targetRepo) });
    });

    app.get("/workflow-stream", async (req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      res.flushHeaders();

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "install-"));
      const contentHawkDir = path.join(tmpDir, "contenthawk");
      const targetDir = path.join(tmpDir, "target");

      try {
        if (req.query["restart"] === "true") {
          sseText(res, "Closing existing PRs\u2026");
          await closePRsForBranch(targetRepo, (l) => sseLine(res, l));
          await deleteBranch(targetRepo, (l) => sseLine(res, l));
        }

        sseText(res, "Cloning SSWConsulting/SSW.ContentHawk\u2026");
        await sparseClone("SSWConsulting/SSW.ContentHawk", contentHawkDir, [".github/workflows", ".github/actions/guard-open-pr", ".contenthawk-version"], (l) => sseLine(res, l));

        sseText(res, `Cloning ${targetRepo}\u2026`);
        await sparseClone(targetRepo, targetDir, [".github"], (l) => sseLine(res, l));

        sseText(res, "Copying .github/workflows\u2026");
        const src = path.join(contentHawkDir, ".github", "workflows");
        const dest = path.join(targetDir, ".github", "workflows");
        await fs.mkdir(dest, { recursive: true });
        for (const file of await fs.readdir(src)) {
          await fs.copyFile(path.join(src, file), path.join(dest, file));
          sseText(res, `  Copied ${file}`);
        }

        sseText(res, "Copying .github/actions/guard-open-pr/action.yml\u2026");
        const actionSrc = path.join(contentHawkDir, ".github", "actions", "guard-open-pr", "action.yml");
        const actionDest = path.join(targetDir, ".github", "actions", "guard-open-pr", "action.yml");
        await fs.mkdir(path.dirname(actionDest), { recursive: true });
        await fs.copyFile(actionSrc, actionDest);
        sseText(res, "  Copied action.yml");

        sseText(res, "Copying .contenthawk-version\u2026");
        await fs.copyFile(path.join(contentHawkDir, ".contenthawk-version"), path.join(targetDir, ".contenthawk-version"));
        sseText(res, "  Copied .contenthawk-version");

        sseText(res, "Running gh aw compile\u2026");
        await compileWorkflows(targetDir, (l) => sseLine(res, l));

        sseText(res, `Creating branch ${CONTENTHAWK_INSTALL_BRANCH}\u2026`);
        await gitRun(["checkout", "-b", CONTENTHAWK_INSTALL_BRANCH], targetDir, (l) => sseLine(res, l));

        sseText(res, "Staging changes\u2026");
        await gitRun(["add", ".github/", ".contenthawk-version"], targetDir, (l) => sseLine(res, l));

        const hasChanges = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: targetDir }).status !== 0;
        if (!hasChanges) { res.write("event: no-changes\ndata: {}\n\n"); return; }

        sseText(res, "Committing\u2026");
        await gitRun(["commit", "-m", "Add ContentHawk GitHub Actions workflows"], targetDir, (l) => sseLine(res, l));

        sseText(res, "Pushing\u2026");
        await gitRun(["push", "-u", "origin", CONTENTHAWK_INSTALL_BRANCH], targetDir, (l) => sseLine(res, l));

        sseText(res, "Creating pull request\u2026");
        await createPR(targetRepo, CONTENTHAWK_INSTALL_BRANCH, targetDir, (l) => sseLine(res, l));

        res.write("event: done\ndata: {}\n\n");
      } catch (err) {
        res.write(`event: failed\ndata: ${JSON.stringify(err instanceof Error ? err.message : String(err))}\n\n`);
      } finally {
        res.end();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    app.post("/submit", async (req, res) => {
      const form = req.body as Record<string, string>;
      const existingSecrets = getExistingSecrets(targetRepo);
      const results: Record<string, SecretResult> = {};
      for (const name of SECRETS) {
        const value = form[name] ?? "";
        results[name] = !value.trim() && existingSecrets.has(name) ? "ok" : await setSecret(targetRepo, name, value);
      }
      res.setHeader("Cache-Control", "no-store");
      res.json({ results });
    });
  }

  // ── Campaign-mode routes ───────────────────────────────────────────────────

  if (mode === "new-campaign" || mode === "campaigns") {
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

    app.get("/run-workflow-stream", async (req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      res.flushHeaders();

      const workflowFields = ["intent", "search_scope", "label_name", "processing_priority", "issue_preferences", "pr_preferences"] as const;
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
  }

  // ── Start server ───────────────────────────────────────────────────────────

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const addr = server.address();
  if (typeof addr === "string" || !addr) die("Failed to bind server");
  const serverUrl = `http://127.0.0.1:${addr.port}/`;

  console.error(`Open ${serverUrl} in your browser.`);
  openBrowser(serverUrl);

  await new Promise<void>(() => {}); // stays alive until /kill calls process.exit
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));