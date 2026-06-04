# ContentHawk — Design Plan

> Status: **Approved for build — v1 defaults locked** · Owner: TinaCMS · Last updated: 2026-06-03

A Claude Code reimplementation of **SSW.ContentHawk** — content auditing for markdown-based
repositories (static sites, docs). ContentHawk reviews repository content for issues such as
out-of-date information and ambiguity, then raises GitHub issues and opens fix PRs.

---

## 1. Background & motivation

The original ContentHawk was *"a set of GitHub agentic workflows auditing markdown-based
repository contents. The workflows use GitHub Copilot CLI to judge content, raise issues, and
create pull requests."*

It was **published** (npm `ssw-contenthawk` + the `ssw-consulting` Claude marketplace, releases
`v0.1.14`–`v0.1.21`, an overview video) **but saw little real adoption** — the GitHub Actions +
Copilot CLI orchestration was too hard to set up. We keep the functionality but change the delivery
mechanism. **v2 reuses the same repo, marketplace, and plugin** (see §3.1).

### The key shift: the agent *is* the workflow

| | Old ContentHawk | New ContentHawk |
|---|---|---|
| Orchestration | GitHub Actions YAML | A Claude Code **skill** (the agent loop) |
| Judging engine | GitHub Copilot CLI | Claude, in-session |
| GitHub operations | Workflow steps | `gh` CLI, driven by the skill |
| "Install" means | Copy + wire workflow files | Check prerequisites + scaffold repo config |
| Run model | Scheduled, unattended | User-invoked, local (automation is a later phase) |

Because the intelligence now lives in the skill rather than in copied infrastructure, most of the
original setup pain disappears.

---

## 2. Goals & non-goals

**Goals**
- Audit markdown/MDX content for quality issues (out-of-date info, ambiguity, and more).
- Raise GitHub **issues** and open fix **PRs**, like the original.
- Let users **add their own checks** without writing code.
- Be **idempotent** — re-running advances work instead of filing duplicates.
- Minimal setup: if the repo is on GitHub and the user has `gh` access, they're basically ready.

**Non-goals (for v1)**
- Scheduled / unattended runs (CI automation) — deferred to a later phase.
- Non-GitHub hosts (GitLab, Bitbucket).
- Non-markdown content (HTML, PDFs, binary assets).
- Auto-merging PRs — ContentHawk proposes; humans decide.

---

## 3. Distribution model

ContentHawk ships as a **Claude Code plugin** bundling the skills (the reusable "how"). The
`contenthawk-install` skill scaffolds a per-repo **`.contenthawk/`** directory (the "what" for
this repo). Clean separation:

```
ContentHawk plugin   →  the skills + logic + built-in checks  (versioned, installed once)
.contenthawk/        →  this repo's config, checks, campaign state  (committed to the repo)
```

**Development & dogfooding:** we build it in this workspace and test against the 7 TinaCMS
starters. `tina-tinadocs` and `tina-nextjs` have the richest content and make the best test beds;
the smaller starters (`tina-barebones`, `tina-hugo`) verify it degrades gracefully on thin content.

### 3.1 Repository, marketplace & versioning (decided)

- **Repository — reuse `SSWConsulting/SSW.ContentHawk` in place.** Marxoz has admin. v2 is a
  breaking rewrite of the *same* repo, not a new one, so the published distribution identity is
  kept and existing installs auto-upgrade on a version bump.
- **Marketplace / plugin — keep the published names.** Marketplace `ssw-consulting`, plugin
  `ssw-contenthawk`, installed via `/plugin marketplace add SSWConsulting/SSW.ContentHawk` →
  `/plugin install ssw-contenthawk@ssw-consulting`. Skill names unchanged (see §4).
- **Versioning — jump `0.1.x` → `2.0.0`** to signal the second generation. Update together:
  `ssw-contenthawk/.claude-plugin/plugin.json`, `.contenthawk-version`, `package.json` (or remove
  npm publishing entirely), plus a `v2.0.0` git tag + GitHub Release.
- **v1 preserved** on branch **`legacy/v1`** (cut from `main` at `0a8e496`) and the existing
  `v0.1.x` tags/releases. The new README points there for anyone on the old pipeline.
- **Removed in v2:** `.github/workflows/content-*`, `.github/aw/`, `.github/actions/`, the entire
  `scripts/` npm/React form app, vite/vitest/shadcn config, and the GH-Actions-secrets install
  flow. The repo becomes plugin-only: `.claude-plugin/` + `ssw-contenthawk/skills/` + built-in
  checks.
- **Forkers:** a repo cannot auto-install a plugin on clone (unsupported). To smooth "fork-and-go,"
  target repos can commit `extraKnownMarketplaces` in `.claude/settings.json` to *suggest* the
  marketplace (a prompt, not automatic) and ship a default `.contenthawk/` config.

---

## 4. Skills

Three skills, split along their **natural cadences**:

| Skill | Cadence | Responsibility |
|---|---|---|
| `contenthawk-install` | once per repo | Preflight + scaffold |
| `contenthawk-add-campaign` | once per audit cycle | Snapshot scope, set active campaign |
| `contenthawk-manage-campaigns` | many times per campaign | Run audit, remediate, report, manage lifecycle |

> **Naming — keep the existing published names** for upgrade continuity (v2 reuses the published
> `ssw-contenthawk` plugin in place — see §3.1). The plugin stays **`ssw-contenthawk`** and the
> three skills keep their current names (`contenthawk-install`, `contenthawk-add-campaign`,
> `contenthawk-manage-campaigns`); only their internals change in v2. The earlier idea of renaming
> `add-campaign` → `start-campaign` is dropped to avoid churn for existing installs, docs, and the video.

### 4.1 `contenthawk-install` — preflight + scaffold

1. **Doctor preflight** (see §6): verify `gh` is installed, authenticated, and has the required
   scopes; guide the user to fix anything missing.
2. **Detect content layout** — find the markdown roots (`content/`, `docs/`, `blog/`,
   `src/content/`, …). For the TinaCMS starters this reuses the knowledge already captured in each
   project's `AGENTS.md`.
3. **Scaffold `.contenthawk/`** — write `config.yml`, copy in the built-in `checks/`, create the
   `campaigns/` directory.
4. **Summarize** what was configured and what to run next. No workflow files are created.

### 4.2 `contenthawk-add-campaign` — start an audit

1. Run the doctor preflight (lightweight).
2. Resolve scope: content globs + enabled checks (defaults from `config.yml`, overridable).
3. **Snapshot** the in-scope files → `campaigns/<id>/snapshot.json` (path + content hash manifest).
4. Optionally open an **umbrella tracking issue** ("ContentHawk Campaign: `<id>`").
5. Mark the campaign **active** in `state.json`.

A *campaign* = one scoped, resumable unit of audit work. Created once, run many times.

### 4.3 `contenthawk-manage-campaigns` — run + remediate + manage

1. Run the doctor preflight.
2. For the **active campaign**, iterate in-scope files and apply each **enabled check**; Claude
   judges and produces findings.
3. **Dedupe** against `findings.json` and existing open `contenthawk`-labeled issues/PRs (see §7).
4. For each new (or grouped) finding, per `config.yml` output mode:
   - open a GitHub **issue**, and/or
   - open a **fix PR** on a `contenthawk/<campaign>/<slug>` branch.
5. Update `findings.json` + campaign status; print a report.
6. **Lifecycle management**: list campaigns, show status, switch active, close a campaign.

Designed to be re-run safely and incrementally (e.g. "audit the next 10 files," "only the
`ambiguity` check," "retry failed PRs").

---

## 5. Repo artifacts — `.contenthawk/`

All git-tracked, so config and audit state are themselves reviewable.

```
.contenthawk/
├── config.yml                 # content globs, enabled checks, labels, branch prefix, output mode
├── checks/
│   ├── outdated-content.md     # built-in
│   ├── ambiguity.md            # built-in
│   ├── …                       # other built-ins
│   └── my-custom-check.md      # user-added (same format)
├── campaigns/
│   └── <id>/
│       ├── snapshot.json        # in-scope file manifest + content hashes at campaign start
│       └── findings.json        # findings + issue/PR links + status
└── state.json                  # which campaign is active
```

### `config.yml` (sketch)

```yaml
content:
  include: ["content/**/*.{md,mdx}", "docs/**/*.{md,mdx}"]
  exclude: ["**/node_modules/**"]
checks:                 # enable/disable + override severity here
  outdated-content: { enabled: true }
  ambiguity:        { enabled: true }
  broken-links:     { enabled: true }
output:
  mode: both                  # issues | prs | both
  labels: ["contenthawk"]
  branchPrefix: "contenthawk/"
  issueGranularity: per-file  # per-file (default) | per-finding
  prGranularity: per-file     # per-file (default) | per-finding | per-campaign
  severityActions:            # which severities produce issues vs. fix PRs
    low:    [issue]
    medium: [issue, pr]
    high:   [issue, pr]
```

> These granularity/severity knobs encode the §11 v1 defaults. Defaults reduce noise
> (grouped-per-file) while staying fully overridable per repo.

---

## 6. Doctor preflight (shared, not a skill)

A lightweight check run at the top of every skill (and the bulk of `install`). It is shared logic,
**not a standalone skill** — auth is a prerequisite, not a goal users set out to invoke.

Checks:
- `gh` is installed.
- `gh auth status` — authenticated.
- Token has the required scopes (see §8).
- `.contenthawk/` exists (for the campaign skills); if not, points the user to run `install`.

When something is missing, it prints the exact remedy. Because `gh auth login` is interactive, the
skill instructs the user to run it themselves in-session, e.g. `! gh auth login` or
`! gh auth refresh -s repo`.

---

## 7. Checks & idempotency

### Check format
A check is a markdown file with frontmatter + a rubric body:

```markdown
---
id: outdated-content
severity: medium
enabled: true
---
Flag content that is no longer accurate: stale version numbers, deprecated APIs,
dates/roadmap items that have passed, "coming soon" features that have shipped, …
```

The audit loads **every enabled check generically**, so users extend ContentHawk by dropping a new
file into `.contenthawk/checks/` — no code change.

### Built-in checks (v1)
`outdated-content` · `ambiguity` · `broken-links` · `code-sample-validity` ·
`terminology-consistency` · `placeholders` (leftover TODO/FIXME/lorem/`<placeholder>`).

### Idempotency
Each finding gets a stable key: **`file path + check id + normalized snippet anchor`**. Before
filing, the audit consults `findings.json` *and* open `contenthawk`-labeled issues/PRs via `gh`. A
re-run therefore **advances** a campaign rather than re-filing duplicates — the exact failure mode
that made the old workflow version painful.

---

## 8. GitHub CLI requirements

ContentHawk drives GitHub through `gh`. Required token scopes:

- **Classic token:** `repo`
- **Fine-grained token:** Contents (read/write), Pull requests (read/write), Issues (read/write),
  Metadata (read)

These cover creating branches, commits, PRs, and issues. The doctor verifies them and guides
`gh auth refresh -s …` if short. Assumption: a TinaCMS user who pulled the starter from GitHub
already has `gh` access to the repo.

---

## 9. Run model & future automation

**v1: local, user-invoked.** Audits run from the user's Claude Code session on demand. This is the
deliberate simplification over the old scheduled-workflow model.

**Later phase (not v1):** recover unattended/scheduled auditing without the original setup pain,
via the Claude Code GitHub Action or `/schedule`. The skills are designed so this can wrap them
later without redesign.

---

## 10. Build plan

| Phase | Deliverable |
|---|---|
| 1 | Plugin scaffold + `contenthawk-install` + the shared **doctor** preflight |
| 2 | `contenthawk-add-campaign` (snapshot + active-state) |
| 3 | `contenthawk-manage-campaigns` — the audit + remediation engine; dogfood against a starter |
| 4 | Polish: report formatting, grouped issues, incremental/subset runs |
| later | Scheduled/CI run model |

---

## 11. Resolved decisions (v1 defaults)

These were the open questions; all are resolved with the defaults below. They are **defaults, not
locks** — every one is overridable in `config.yml` (or a follow-up revision), and we expect to
revisit them with real audit experience.

| # | Question | v1 decision | Override |
|---|---|---|---|
| 1 | **Issue granularity** | **Grouped per file** — one issue per file gathering that file's findings, to reduce noise. | `output.issueGranularity: per-finding` |
| 2 | **PR granularity** | **Per file** — one fix PR per file on a `contenthawk/<campaign>/<file-slug>` branch. | `output.prGranularity: per-finding \| per-campaign` |
| 3 | **Severity → action** | **Severity-informed, configurable**: `low` → issue only; `medium`/`high` → issue **and** fix PR. Avoids opening PRs for trivially low-confidence nits while still surfacing them. | `output.severityActions` |
| 4 | **Snapshot drift** | **Warn, don't auto-rebaseline.** If an in-scope file's hash differs from the campaign snapshot, flag it in the report and skip remediation for that file until the user explicitly re-baselines (an `add-campaign` re-run or an explicit re-snapshot). Prevents acting on stale findings. | n/a (explicit re-baseline) |
| 5 | **Naming** | **Keep the existing published names** (reuse-in-place): plugin **`ssw-contenthawk`**; skills **`contenthawk-install`**, **`contenthawk-add-campaign`**, **`contenthawk-manage-campaigns`** (see §4). | rename later if ever needed |

## 12. Future considerations (not v1)

- Scheduled / unattended runs via the Claude Code GitHub Action or `/schedule` (see §9).
- Non-GitHub hosts; non-markdown content.
- Smarter grouping (e.g. one PR per logical topic spanning files) once we see real audit output.
