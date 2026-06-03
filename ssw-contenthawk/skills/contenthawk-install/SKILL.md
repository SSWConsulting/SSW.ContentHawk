---
name: contenthawk-install
description: Set up ContentHawk in the current GitHub repository — verify GitHub CLI access and scaffold the .contenthawk/ config and checks. Use when the user wants to install, set up, initialise, or configure ContentHawk on a repo so it can audit content and open issues/PRs.
---

# Install ContentHawk into a repository

ContentHawk audits the markdown/MDX content of a repo and opens GitHub issues and fix PRs. This
skill is run **once per repo**, from inside the repository you want to audit. It does **not** create
any GitHub Actions or workflows — the auditing is done by the ContentHawk skills themselves. All it
does is check prerequisites and scaffold a committed `.contenthawk/` config directory.

Files referenced below are bundled with this plugin, relative to this skill file:
`../../shared/doctor.md`, `../../checks/`, `../../templates/config.yml`.

## Step 1 — Doctor preflight

Read `../../shared/doctor.md` and run checks **1–5** in order (skip check 6 — that's for the
campaign skills). On the first failure, print the remedy and STOP. Note the `owner/repo` from
check 5.

## Step 2 — Detect the content layout

Find the folders that hold the repo's markdown/MDX content so the config's globs are accurate.

- List the repo root and look for common roots: `content/`, `docs/`, `blog/`, `src/content/`,
  `pages/`, `_posts/`. Only include roots that actually exist.
- If an `AGENTS.md` / `CLAUDE.md` documents where content lives, trust it.
- **Scope to first-party content; exclude vendored and generated files** so the audit never wastes
  effort on code you don't own. Prefer content-root-scoped globs (e.g. `content/**/*.{md,mdx}`) over
  a repo-wide `**/*.md`, and add excludes for: `node_modules/`, vendored themes (Hugo `themes/`),
  generators' scaffolds/output (`archetypes/`, `resources/`, `public/`, `dist/`, `build/`, `.next/`,
  `out/`), and changelogs/license files.
- Confirm the proposed globs with the user, showing roughly how many files match. If you find
  nothing obvious, ask the user which paths to audit.

## Step 3 — Scaffold `.contenthawk/`

Create the directory structure (only what's missing — never overwrite an existing `config.yml`
without confirming):

```
.contenthawk/
├── config.yml      # from ../../templates/config.yml, with content.include set to the detected globs
├── checks/         # copy of every file in ../../checks/ (the built-in rubrics)
└── campaigns/      # empty; campaigns land here
```

- Read `../../templates/config.yml`, set `content.include` (and sensible `exclude`) to the globs
  agreed in Step 2, and write it to `.contenthawk/config.yml`.
- Copy each built-in check from `../../checks/` into `.contenthawk/checks/`.
- Create an empty `.contenthawk/campaigns/` (add a `.gitkeep` so it commits).

## Step 4 — Summarise and commit

- Print what was created, the content globs, and the enabled checks.
- Tell the user to **commit `.contenthawk/`** (offer to stage and commit it for them).
- Remind them they can customise: edit `config.yml` (globs, `output.mode`, severity actions) and add
  their own checks by dropping a markdown file into `.contenthawk/checks/`.

## Step 5 — Offer the first campaign

Offer to chain straight into the first audit: ask the user whether to run **`/contenthawk-add-campaign`**
now to start their first campaign. If yes, hand off to that skill; if no, tell them to run it when
ready.
