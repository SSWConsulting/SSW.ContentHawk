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
import { CONTENTHAWK_WORKFLOW_FILE } from "./constants.ts";

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
): Promise<void> {
  return new Promise((resolve, reject) => {
    onLine(`Triggering ${CONTENTHAWK_WORKFLOW_FILE}\u2026`);
    const fieldArgs = Object.entries(fields).flatMap(([k, v]) => ["--field", `${k}=${v}`]);
    const child = spawn("gh", [
      "workflow",
      "run",
      CONTENTHAWK_WORKFLOW_FILE,
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

const REQUIRED_FIELDS = [
  "intent",
  "search_scope",
  "label_name",
  "processing_priority",
  "issue_preferences",
  "pr_preferences",
] as const;

type FieldName = (typeof REQUIRED_FIELDS)[number];

function parseArgs(argv: string[]): { targetRepo: string; cliFields: Partial<Record<FieldName, string>> } {
  const targetRepo = argv[0];
  if (
    !targetRepo ||
    !targetRepo.includes("/") ||
    targetRepo.startsWith("/") ||
    targetRepo.endsWith("/")
  ) {
    die("Usage: run-workflow.ts <owner/repo> [--intent \"...\" --search_scope \"...\" ...]");
  }

  const cliFields: Partial<Record<FieldName, string>> = {};
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const eqMatch = arg.match(/^--([a-z_]+)=(.+)$/s);
    if (eqMatch) {
      cliFields[eqMatch[1] as FieldName] = eqMatch[2];
      continue;
    }
    const flagMatch = arg.match(/^--([a-z_]+)$/);
    if (flagMatch && i + 1 < rest.length) {
      cliFields[flagMatch[1] as FieldName] = rest[++i];
    }
  }

  return { targetRepo, cliFields };
}

async function main() {
  const { targetRepo, cliFields } = parseArgs(process.argv.slice(2));

  checkGh();

  const [clientBundle, css] = await Promise.all([bundleClient(), buildCSS()]);
  const token = crypto.randomBytes(24).toString("base64url");

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(renderForm(targetRepo, token, css, cliFields as Record<string, string>));
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

      const requestFields: Record<string, string> = { ...cliFields };
      for (const key of REQUIRED_FIELDS) {
        const val = url.searchParams.get(key);
        if (val) requestFields[key] = val;
      }
      const missingFields = REQUIRED_FIELDS.filter((f) => !requestFields[f]);
      if (missingFields.length) {
        res.write(
          `event: failed\ndata: ${JSON.stringify(`Missing required fields: ${missingFields.join(", ")}`)}\n\n`,
        );
        res.end();
        return;
      }

      try {
        const beforeMs = Date.now();
        await triggerWorkflow(targetRepo, requestFields as Record<FieldName, string>, sendLine);
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
