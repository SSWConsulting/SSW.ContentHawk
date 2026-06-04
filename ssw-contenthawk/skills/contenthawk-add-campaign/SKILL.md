---
name: contenthawk-add-campaign
description: Start a new ContentHawk audit campaign in the current repository — snapshot the in-scope content and set it as the active campaign. Use when the user wants to begin, kick off, or start a ContentHawk content audit.
---

# Start a ContentHawk campaign

A **campaign** is one scoped, resumable unit of audit work: a frozen snapshot of the content to
review plus the checks to run against it. You create a campaign once here, then run/advance it
repeatedly with `/contenthawk-manage-campaigns`. Keeping the snapshot fixed is what lets the audit
resume without re-filing duplicates and detect when content drifts underneath it.

Bundled reference under `${CLAUDE_PLUGIN_ROOT}` (the plugin's install directory):
`${CLAUDE_PLUGIN_ROOT}/shared/doctor.md`. Read it from that path — a relative path won't resolve
once the plugin is installed.

## Step 1 — Doctor preflight

Read `${CLAUDE_PLUGIN_ROOT}/shared/doctor.md` and run checks **1–6** (including check 6: `.contenthawk/` exists — if
it doesn't, stop and tell the user to run `/contenthawk-install`). Stop on the first failure. Note
the `owner/repo`.

## Step 2 — Resolve scope

Read `.contenthawk/config.yml`.

- **Files:** the in-scope set is `content.include` minus `content.exclude`.
- **Checks:** every check that is enabled — i.e. each `.contenthawk/checks/*.md` whose frontmatter
  `enabled` is not `false`, intersected with any `checks:` overrides in `config.yml`.
- Briefly show the user the resolved scope (roughly how many files, which checks) and let them
  **narrow** it for this campaign if they want (fewer paths or a subset of checks). Don't widen
  beyond what's configured without confirming.

## Step 3 — Name the campaign

- Ask for an optional short **name** (default `audit`). Slugify it (lowercase, hyphens).
- Get today's date: `date +%F`.
- Campaign **id** = `<date>-<slug>` (e.g. `2026-06-03-audit`). If a campaign with that id already
  exists under `.contenthawk/campaigns/`, append `-2`, `-3`, … to keep it unique.

## Step 4 — Snapshot the in-scope files

Build a manifest of the files to audit with a content hash for each (the hash lets the audit detect
drift later). From the repo root, list the in-scope files with `git ls-files` and hash each with
`git hash-object`. **Two git-pathspec gotchas** (verified — get these wrong and you snapshot the
wrong files):

- Pathspecs do **not** expand braces. Split `*.{md,mdx}` into separate `*.md` and `*.mdx`
  pathspecs.
- Use the `:!(glob)…` exclude form. The `:(exclude)…` / `:(glob,exclude)…` forms silently drop
  *everything* here.

```bash
# includes via :(glob); excludes via :!(glob); braces expanded by hand
git ls-files -- \
  ':(glob)content/**/*.md' ':(glob)content/**/*.mdx' \
  ':!(glob)**/node_modules/**' ':!(glob)themes/**' | while read -r f; do
  printf '%s  %s\n' "$(git hash-object "$f")" "$f"
done
```

Adapt the pathspecs to the repo's actual `include`/`exclude`. If some content isn't git-tracked,
fall back to `find` + `shasum -a 256`. If the list is very large, tell the user the count and
proceed (don't silently truncate).

Write `.contenthawk/campaigns/<id>/snapshot.json`:

```json
{
  "id": "<id>",
  "createdDate": "<YYYY-MM-DD>",
  "status": "open",
  "umbrellaIssue": null,
  "scope": {
    "include": ["..."],
    "exclude": ["..."],
    "checks": ["outdated-content", "ambiguity", "..."]
  },
  "files": [
    { "path": "content/posts/hello-world.md", "hash": "<git-hash-object output>" }
  ]
}
```

Also create an empty findings file `.contenthawk/campaigns/<id>/findings.json`:

```json
{ "campaignId": "<id>", "findings": [] }
```

## Step 5 — Optional umbrella tracking issue

Ask whether to open a GitHub issue to track this campaign (recommended). If yes:

1. Ensure the label exists: `gh label create "<label>" --color FBCA04 --description "ContentHawk" 2>/dev/null || true` (use the first entry of `output.labels` from config, default `contenthawk`).
2. Open it:
   ```bash
   gh issue create --title "ContentHawk Campaign: <id>" \
     --label "<label>" \
     --body "<scope summary: file count, checks, created date>"
   ```
3. Capture the new issue number and write it into `snapshot.json`'s `umbrellaIssue`.

## Step 6 — Set active, summarise, commit

- Write `.contenthawk/state.json` → `{ "activeCampaign": "<id>" }`. If a different campaign was
  already active, confirm with the user before switching.
- Summarise: campaign id, file count, enabled checks, and the umbrella issue link (if any).
- Offer to stage and commit the new `.contenthawk/campaigns/<id>/` and `state.json`.
- Tell the user to run **`/contenthawk-manage-campaigns`** to run the audit against this campaign.
