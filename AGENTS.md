# AGENTS.md

This file provides guidance to AI coding agents working in this repository.

## What this repository is

This repo **is** ContentHawk: a Claude Code **plugin** distributed through the `ssw-consulting`
marketplace. As of **v2** there is no application code, no GitHub Actions pipeline, and no npm
package — the auditing is performed by the skills themselves when a user runs them. The repo is
just the plugin: skill instructions plus the bundled check rubrics and config template.

> v1 (the old GitHub-Actions + Copilot-CLI + React-form-app pipeline) is preserved on the
> **`legacy/v1`** branch and the `v0.1.x` releases. Do not reintroduce it on `main`/`v2`.

## Layout

```
.claude-plugin/marketplace.json     # the ssw-consulting marketplace (lists the plugin)
ssw-contenthawk/
├── .claude-plugin/plugin.json      # plugin manifest (name, version, skills dir)
├── skills/                         # the three skills (each a dir with SKILL.md)
│   ├── contenthawk-install/
│   ├── contenthawk-add-campaign/
│   └── contenthawk-manage-campaigns/
├── shared/doctor.md                # preflight checklist shared by all skills
├── checks/                         # built-in audit rubrics (the check library)
└── templates/config.yml            # default .contenthawk/config.yml written by install
_docs/v2-design.md                  # full v2 architecture & decisions
```

Only `ssw-contenthawk/skills/` is scanned for skills (per `plugin.json`'s `"skills": "./skills/"`);
`shared/`, `checks/`, and `templates/` are plain bundled files the skills read at runtime.

## How it works (the model)

- A **skill** is a `SKILL.md` of natural-language instructions Claude follows. Skills reference
  bundled files by path **relative to the SKILL.md** (e.g. `../../shared/doctor.md`).
- Every skill starts with the **doctor preflight** (`shared/doctor.md`): `gh` installed, authed,
  scoped; git identity set; inside a GitHub repo. Keep that one file the single source of truth —
  don't duplicate preflight logic into each skill.
- `contenthawk-install` scaffolds a committed **`.contenthawk/`** directory in the *target* repo
  (config + a copy of `checks/` + `campaigns/`). The audit reads enabled checks from there, so
  users can add checks without touching this plugin.
- A **check** is a markdown rubric with `id` / `severity` / `enabled` frontmatter. The audit loads
  every enabled check generically — adding one is a new file, not new code.

## Conventions

- Keep skills declarative and tool-agnostic; drive GitHub through the `gh` CLI, never hardcode
  tokens or org/repo-specific values (this is a public template — see `_docs/v2-design.md` §2).
- Keep skill names stable (`contenthawk-install`, `contenthawk-add-campaign`,
  `contenthawk-manage-campaigns`) — existing installs upgrade in place.
- Bump `ssw-contenthawk/.claude-plugin/plugin.json` `version` (and `.contenthawk-version`) on
  releases; tag + cut a GitHub Release.

## Status

v2 is in progress. `contenthawk-install` + the doctor and `contenthawk-add-campaign` are
implemented; `contenthawk-manage-campaigns` (Phase 3 — the audit & remediation engine) is a stub
pending rewrite — see `_docs/v2-design.md` §10 and the skill's SKILL.md.
