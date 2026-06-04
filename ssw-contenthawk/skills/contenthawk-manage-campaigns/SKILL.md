---
name: contenthawk-manage-campaigns
description: Run a ContentHawk audit for the active campaign and manage campaigns — judge content against the enabled checks, open issues and fix PRs, report status, and list/switch/close campaigns. Use when the user wants to run, advance, or manage a ContentHawk content audit.
---

# Run & manage ContentHawk campaigns

This skill runs the audit for the **active campaign** and remediates findings by opening GitHub
issues and fix PRs. It is **idempotent and resumable**: re-running advances the campaign — it never
re-files a finding that already has an open issue/PR. ContentHawk **proposes**; it never merges PRs
or closes issues the user didn't ask to close.

Bundled reference under `${CLAUDE_PLUGIN_ROOT}` (the plugin's install directory):
`${CLAUDE_PLUGIN_ROOT}/shared/doctor.md`. Read it from that path — a relative path won't resolve
once the plugin is installed.

## Step 1 — Doctor preflight

Read `${CLAUDE_PLUGIN_ROOT}/shared/doctor.md` and run checks **1–6**. Stop on the first failure. Note `owner/repo`.

## Step 2 — Decide the action

Default is **run the audit** (Steps 3–8). If the user instead asks to *list*, *show status*,
*switch*, or *close* campaigns, jump to **Campaign management** at the bottom.

## Step 3 — Load the active campaign

- Read `.contenthawk/state.json` → `activeCampaign`. If unset, list the campaigns under
  `.contenthawk/campaigns/` and ask which to use (or tell the user to run
  `/contenthawk-add-campaign`).
- Load `campaigns/<id>/snapshot.json` (scope, file manifest, `umbrellaIssue`) and `findings.json`.
- Load every **enabled** check from `.contenthawk/checks/` (parse each file's `id` / `severity` /
  `enabled` frontmatter; skip `enabled: false`). Intersect with any `checks:` overrides in
  `config.yml`.
- Read `output` from `config.yml`: `mode`, `labels`, `branchPrefix`, `issueGranularity`,
  `prGranularity`, `severityActions`.

## Step 4 — Drift check (don't audit stale files)

For each file in `snapshot.files`, recompute `git hash-object <path>` and compare to the stored
hash:

- **Unchanged** → eligible for audit.
- **Changed** → the content moved since the snapshot. **Warn**, skip remediation for it this run,
  and record it in the report. Do **not** auto-rebaseline (the user re-snapshots via
  `/contenthawk-add-campaign` when ready).
- **Missing** (file deleted) → note and skip.

## Step 5 — Judge the content

Determine the working set: in-scope, unchanged files. Let the user limit it if they ask
(e.g. "just the first 10 files", "only the `ambiguity` check"); if you cap the set, **say so** in
the report — never truncate silently.

For each file, read it and apply each enabled check's rubric (the body of its
`.contenthawk/checks/<id>.md`). Produce findings, each with:

- `file`, `checkId`, `severity` (from the check), a short `title`, a `detail` explaining the
  problem, a `locator` (heading/line/quoted snippet), and a concrete `suggestedFix`.
- A stable **key**: a short hash of `"<file>|<checkId>|<normalized offending snippet>"`. This key is
  how re-runs recognise the same finding.

Be conservative — only defensible findings per the rubrics. A file with no issues produces nothing.

## Step 6 — Dedup

For each finding, skip it if it's already handled:

- It's in `findings.json` with an open issue or PR, **or**
- An open GitHub issue/PR for the same file already carries its marker. Reconcile with GitHub (don't
  trust `findings.json` alone — an issue may have been closed/edited). Query by marker directly:
  `gh issue list --label "<label>" --state open --search "file=<path> in:body"` and the equivalent
  `gh pr list … --search "file=<path> in:body"`. Treat a hit as already-filed — update it rather
  than open a duplicate. Every issue/PR body must embed `<!-- contenthawk:campaign=<id> file=<path> -->`
  for this to work.

## Step 7 — Open issues

Honor `output.mode` (`issues`/`prs`/`both`) and `severityActions` (only file findings whose severity
maps to `issue`). With the default `issueGranularity: per-file`, group a file's findings into **one**
issue:

- Title: `[ContentHawk] <relative/path>: <N> issue(s)`
- Body: one section per finding (check id, severity, detail, suggested fix, locator); a link to the
  umbrella issue (`snapshot.umbrellaIssue`) if set; and the marker
  `<!-- contenthawk:campaign=<id> file=<path> -->`.
- Labels: `output.labels`. Ensure the label exists first
  (`gh label create "<label>" --color FBCA04 2>/dev/null || true`).
- If an open issue with this marker already exists, **update** it instead of creating a duplicate.

Create/update with `gh issue create` / `gh issue edit`. Record the issue number against the file's
findings in `findings.json`.

## Step 8 — Open fix PRs

With `prGranularity: per-file` (default), for the findings whose severity maps to `pr`
(`medium`/`high` by default):

1. Branch off the repo's **default branch**:
   `git switch -c "<branchPrefix><id>/<file-slug>"` (reuse it if it already exists).
2. Apply the `suggestedFix` for each of that file's PR-eligible findings — minimal, scoped edits to
   that file only. Don't make unrelated changes.
3. Commit, push, and open the PR:
   - Title: `[ContentHawk] Fix <relative/path>`
   - Body: what changed per finding, `Closes #<issue>` if it fully resolves the file's issue, and
     the marker comment.
   - `gh pr create --base <default-branch> --head <branch> --label "<label>"`.
4. If a branch/PR for this file already exists, push additional commits to it rather than opening a
   duplicate. **Never merge.**

Record the PR number against the file's findings in `findings.json`.

## Step 9 — Persist and report

- Write `findings.json` — every finding with its `key`, `severity`, `status`
  (`issued` / `pr-open` / `skipped` / `resolved`), and any `issue` / `pr` numbers.
- Print a report: files audited, findings by severity, issues opened/updated, PRs opened/updated,
  files skipped for drift, findings skipped as duplicates — with links. Remind the user that
  re-running advances the campaign, and that they review and merge (ContentHawk won't).

## Campaign management

When the user asks to manage rather than run:

- **list** — enumerate `.contenthawk/campaigns/<id>/`; for each show `status` (open/done from
  `snapshot.json`), file count, and issue/PR counts from `findings.json`. Mark the active one.
- **status** — summarise the active campaign's `findings.json`.
- **switch `<id>`** — set `state.json.activeCampaign` to `<id>` (confirm first).
- **close `<id>`** — set `snapshot.json.status` to `done`; offer to close the umbrella issue
  (`gh issue close <umbrellaIssue>`); if it was active, ask which campaign (if any) to make active
  next.
