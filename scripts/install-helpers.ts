import { spawn, spawnSync } from "node:child_process";
import { CONTENTHAWK_INSTALL_BRANCH } from "@/constants.ts";

export function checkBranchExists(targetRepo: string): boolean {
  const [owner, repo] = targetRepo.split("/");
  return spawnSync("gh", ["api", `repos/${owner}/${repo}/branches/${CONTENTHAWK_INSTALL_BRANCH}`], { stdio: "pipe" }).status === 0;
}

export function closePRsForBranch(targetRepo: string, onLine: (l: string) => void): Promise<void> {
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

export function deleteBranch(targetRepo: string, onLine: (l: string) => void): Promise<void> {
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

export function gitRun(args: string[], cwd: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`git ${args[0]} exited ${code}`))));
  });
}

export function sparseClone(repoRef: string, destDir: string, paths: string[], onLine: (l: string) => void): Promise<void> {
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

export function compileWorkflows(cwd: string, onLine: (l: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["aw", "compile"], { cwd });
    child.stdout.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.stderr.on("data", (d) => String(d).split("\n").filter(Boolean).forEach(onLine));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`gh aw compile exited ${code}`))));
  });
}

export function createPR(targetRepo: string, _branch: string, cwd: string, onLine: (l: string) => void): Promise<void> {
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
