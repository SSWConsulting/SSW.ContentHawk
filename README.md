# SSW.ContentHawk

> ⚠️ **v2 is under active development on the `v2` branch (beta).** v2 replaces the original
> GitHub-Actions + Copilot-CLI pipeline with a self-contained set of Claude Code skills — the agent
> does the auditing directly, so there are no workflows or secrets to set up. Looking for the
> original pipeline? See the **`legacy/v1`** branch or the **`v0.1.x`** releases.

ContentHawk audits the markdown/MDX content of a repository — static sites, docs, blogs — and
flags issues such as out-of-date information, ambiguity, broken links, invalid code samples,
inconsistent terminology, and leftover placeholders. It opens GitHub **issues** and **fix PRs** so
you can review and merge the changes.

It ships as a Claude Code plugin with three skills:

| Skill | When | What it does |
|---|---|---|
| `contenthawk-install` | once per repo | Verifies GitHub CLI access and scaffolds the committed `.contenthawk/` config + checks. |
| `contenthawk-add-campaign` | per audit cycle | Snapshots the in-scope content and starts a new audit campaign. |
| `contenthawk-manage-campaigns` | repeatedly | Runs the audit against the active campaign, opens issues + fix PRs, and reports. |

## Install the plugin (once per user)

```bash
/plugin marketplace add SSWConsulting/SSW.ContentHawk
/plugin install ssw-contenthawk@ssw-consulting
/reload-plugins
```

The three skills are then available in any repo you open.

> **Trying the v2 beta (before it's merged to `main`):** v2 lives on the `v2` branch. Install it
> directly from that branch with `/plugin marketplace add SSWConsulting/SSW.ContentHawk@v2`, or from
> a local clone with `/plugin marketplace add /absolute/path/to/SSW.ContentHawk` (uses whatever
> branch is checked out). Then `/plugin install ssw-contenthawk@ssw-consulting` and `/reload-plugins`
> as above.

## Use it

1. **Set up the repo** — open the repo you want to audit in Claude Code and run `/contenthawk-install`.
   It checks your `gh` access (guiding you through `gh auth login`/scopes if needed), detects your
   content folders, and writes `.contenthawk/` (config + checks). Commit that directory.
2. **Start a campaign** — `/contenthawk-add-campaign` snapshots the content to audit.
3. **Run the audit** — `/contenthawk-manage-campaigns` judges the content, opens issues and fix PRs,
   and prints a report. Re-run it to advance the campaign — it won't file duplicates.
4. **Review & merge** — ContentHawk proposes; you decide. It never auto-merges.

### Configure & extend

Everything lives in the committed `.contenthawk/` directory:

- **`config.yml`** — which paths to audit, which checks are on, and whether findings become issues,
  PRs, or both (per severity).
- **`checks/`** — the audit rubrics. Add your own by dropping in a markdown file with `id`,
  `severity`, and `enabled` frontmatter plus a rubric body; it's picked up automatically.

## Example: a first audit

Say your repo keeps docs under `docs/` and posts under `content/`. After installing the plugin,
run the three skills in order:

```bash
/contenthawk-install           # detects docs/ + content/, scaffolds .contenthawk/ (config + checks)
/contenthawk-add-campaign      # snapshots the in-scope files, opens an umbrella tracking issue
/contenthawk-manage-campaigns  # audits the content and opens issues + fix PRs
```

A typical first run on a small docs set produces, for example:

- **1 umbrella issue** tracking the campaign — e.g. `ContentHawk Campaign: 2026-06-04-audit`.
- **One issue per file with findings** — e.g. `[ContentHawk] docs/getting-started.md: 3 issue(s)`,
  listing each problem (an outdated version number, a leftover `TODO`, a vague instruction).
- **One fix PR per file** for the medium/high findings, on a `contenthawk/<campaign>/<file>` branch.
  Low-severity nits (e.g. inconsistent terminology) are left in the issue for you to judge rather
  than auto-changed.

Files with no problems (like a clean reference page) are left untouched. Re-running
`/contenthawk-manage-campaigns` **advances the same campaign** — it never re-files a finding that
already has an open issue or PR, so you can run it repeatedly as you work through the backlog.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- The [GitHub CLI](https://cli.github.com) (`gh`), authenticated with permission to open issues,
  branches, and PRs on the target repo (classic token `repo` scope, or a fine-grained token with
  Contents + Pull requests + Issues read/write). `contenthawk-install` checks this for you.

## Design

See [`_docs/v2-design.md`](./_docs/v2-design.md) for the full v2 architecture and decisions.
