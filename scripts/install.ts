#!/usr/bin/env -S npx tsx
/**
 * SSW env installer — local form server.
 *
 * Spins up a one-shot HTTP server on 127.0.0.1:<random>, opens a browser to
 * an HTML form, accepts a POST containing one secret per field, runs
 * `gh secret set` for each, then shuts down. A single-use token in the URL
 * prevents other local processes from intercepting.
 *
 * Usage: install.ts <owner/repo>
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import fs from "node:fs/promises";
import { SECRETS, renderForm } from "./form.tsx";
import { CONTENTHAWK_INSTALL_BRANCH } from "./constants.ts";

async function bundleClient(): Promise<string> {
  const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), "form-client.tsx");
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

type SecretResult = "ok" | "skipped" | { error: string };


function checkBranchExists(targetRepo: string): boolean {
  const [owner, repo] = targetRepo.split("/");
  const result = spawnSync("gh", ["api", `repos/${owner}/${repo}/branches/${CONTENTHAWK_INSTALL_BRANCH}`], { stdio: "pipe" });
  return result.status === 0;
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
      onLine(`Closing PR #${pr.number}…`);
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
    onLine(`Deleting branch ${CONTENTHAWK_INSTALL_BRANCH}…`);
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

function createPR(targetRepo: string, branch: string, cwd: string, onLine: (l: string) => void): Promise<void> {
  const body = [
    "## 🦅 ContentHawk Installation",
    "",
    "This pull request installs [ContentHawk](https://github.com/SSWConsulting/SSW.ContentHawk) into this repository.",
    "",
    "### What's included",
    "- `.github/workflows/` — ContentHawk GitHub Actions workflows",
    "- `.github/actions/guard-open-pr/` — supporting composite action",
    "- `.contenthawk-version` — pinned ContentHawk version for this repo",
    "",
    "### Source",
    "Files were copied from [SSWConsulting/SSW.ContentHawk](https://github.com/SSWConsulting/SSW.ContentHawk) and compiled with `gh aw compile`.",
    "",
    "### Next steps",
    "Review the changes, then merge to enable ContentHawk on this repo.",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn("gh", [
      "pr", "create",
      "--title", "🦅 Installing ContentHawk",
      "--body", body,
      "--repo", targetRepo,
    ], { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gh pr create exited ${code}`))));
  });
}

function die(msg: string, code = 1): never {
  console.error(`ERROR: ${msg}`);
  process.exit(code);
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

function getExistingSecrets(targetRepo: string): Set<string> {
  const result = spawnSync("gh", ["secret", "list", "--repo", targetRepo, "--json", "name"], { encoding: "utf-8" });
  if (result.status !== 0) return new Set();
  try {
    const list = JSON.parse(result.stdout) as Array<{ name: string }>;
    return new Set(list.map((s) => s.name));
  } catch {
    return new Set();
  }
}

function setSecret(
  targetRepo: string,
  name: string,
  value: string,
): Promise<SecretResult> {
  if (!value.trim()) return Promise.resolve("skipped");
  return new Promise((resolve) => {
    const child = spawn("gh", [
      "secret",
      "set",
      name,
      "--repo",
      targetRepo,
      "--body",
      value,
    ]);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => resolve({ error: err.message }));
    child.on("close", (code) => {
      if (code === 0) resolve("ok");
      else {
        const last = stderr.trim().split("\n").pop() || `exit ${code}`;
        resolve({ error: last });
      }
    });
    child.stdin.end();
  });
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

async function main() {
  const targetRepo = process.argv[2];
  if (
    !targetRepo ||
    !targetRepo.includes("/") ||
    targetRepo.startsWith("/") ||
    targetRepo.endsWith("/")
  ) {
    die("Usage: install.ts <owner/repo>");
  }

  checkGh();

  const [clientBundle, css] = await Promise.all([bundleClient(), buildCSS()]);
  const token = crypto.randomBytes(24).toString("base64url");
  let results: Record<string, SecretResult> | undefined;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(renderForm(targetRepo, token, css));
    }
    if(req.method === "POST" && url.pathname === "/kill") {
      process.exit(0);
    }
    
    if (req.method === "GET" && url.pathname === "/bundle.js") {
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      });
      return res.end(clientBundle);
    }

    if (req.method === "GET" && url.pathname === "/existing-secrets") {
      const existing = getExistingSecrets(targetRepo);
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ existing: [...existing] }));
    }

    if (req.method === "GET" && url.pathname === "/branch-status") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ exists: checkBranchExists(targetRepo) }));
    }

    if (req.method === "GET" && url.pathname === "/workflow-stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.flushHeaders();

      type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };
      const send = (event: LogEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      const log = (message: string) => send({ type: "log", message });
      const sendLine = (line: string) =>
        /^https?:\/\//.test(line)
          ? send({ type: "link", message: line, url: line })
          : log(line);

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "install-"));
      const contentHawkDir = path.join(tmpDir, "contenthawk");
      const targetDir = path.join(tmpDir, "target");

      try {
        if (url.searchParams.get("restart") === "true") {
          log("Closing existing PRs…");
          await closePRsForBranch(targetRepo, sendLine);
          await deleteBranch(targetRepo, sendLine);
        }

        log("Cloning SSWConsulting/SSW.ContentHawk…");
        await sparseClone("SSWConsulting/SSW.ContentHawk", contentHawkDir, [".github/workflows", ".github/actions/guard-open-pr", ".contenthawk-version"], sendLine);

        log(`Cloning ${targetRepo}…`);
        await sparseClone(targetRepo, targetDir, [".github"], sendLine);

        log("Copying .github/workflows…");
        const src = path.join(contentHawkDir, ".github", "workflows");
        const dest = path.join(targetDir, ".github", "workflows");
        await fs.mkdir(dest, { recursive: true });
        for (const file of await fs.readdir(src)) {
          await fs.copyFile(path.join(src, file), path.join(dest, file));
          log(`  Copied ${file}`);
        }

        log("Copying .github/actions/guard-open-pr/action.yml…");
        const actionSrc = path.join(contentHawkDir, ".github", "actions", "guard-open-pr", "action.yml");
        const actionDest = path.join(targetDir, ".github", "actions", "guard-open-pr", "action.yml");
        await fs.mkdir(path.dirname(actionDest), { recursive: true });
        await fs.copyFile(actionSrc, actionDest);
        log("  Copied action.yml");

        log("Copying .contenthawk-version…");
        await fs.copyFile(path.join(contentHawkDir, ".contenthawk-version"), path.join(targetDir, ".contenthawk-version"));
        log("  Copied .contenthawk-version");

        log("Running gh aw compile…");
        await compileWorkflows(targetDir, sendLine);

        log(`Creating branch ${CONTENTHAWK_INSTALL_BRANCH}…`);
        await gitRun(["checkout", "-b", CONTENTHAWK_INSTALL_BRANCH], targetDir, sendLine);

        log("Staging changes…");
        await gitRun(["add", ".github/", ".contenthawk-version"], targetDir, sendLine);

        const hasChanges = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: targetDir }).status !== 0;
        if (!hasChanges) {
          res.write("event: no-changes\ndata: {}\n\n");
          return;
        }

        log("Committing…");
        await gitRun(["commit", "-m", "Add ContentHawk GitHub Actions workflows"], targetDir, sendLine);

        log("Pushing…");
        await gitRun(["push", "-u", "origin", CONTENTHAWK_INSTALL_BRANCH], targetDir, sendLine);

        log("Creating pull request…");
        await createPR(targetRepo, CONTENTHAWK_INSTALL_BRANCH, targetDir, sendLine);

        res.write("event: done\ndata: {}\n\n");
      } catch (err) {
        res.write(`event: failed\ndata: ${JSON.stringify(err instanceof Error ? err.message : String(err))}\n\n`);
      } finally {
        res.end();
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/submit") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const form = new URLSearchParams(Buffer.concat(chunks).toString("utf-8"));

      console.error("FORM_SUBMITTED");

      const existingSecrets = getExistingSecrets(targetRepo);
      const next: Record<string, SecretResult> = {};
      for (const name of SECRETS) {
        const value = form.get(name) ?? "";
        if (!value.trim() && existingSecrets.has(name)) {
          next[name] = "ok";
        } else {

          console.log(`Setting secret ${name}…`);
          next[name] = await setSecret(targetRepo, name, value);
        }
      }
      results = next;

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ results }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (typeof addr === "string" || !addr) die("Failed to bind server");
  const url = `http://127.0.0.1:${addr.port}/?token=${encodeURIComponent(token)}`;

  console.error(`Open ${url} in your browser to enter secrets.`);
  openBrowser(url);

  await done;
  server.close();

  if (!results) die("No submission received.");

  const ok = SECRETS.filter((n) => results![n] === "ok");
  const skipped = SECRETS.filter((n) => results![n] === "skipped");
  const failed = SECRETS.filter((n) => typeof results![n] === "object");

  if (ok.length) console.log(`Set: ${ok.join(", ")}`);
  if (skipped.length) console.log(`Skipped (empty): ${skipped.join(", ")}`);
  if (failed.length) {
    const detail = failed
      .map((n) => `${n} (${(results![n] as { error: string }).error})`)
      .join("; ");
    console.error(`Failed: ${detail}`);
    process.exit(1);
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
