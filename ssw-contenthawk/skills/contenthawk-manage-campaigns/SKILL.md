---
name: contenthawk-manage-campaigns
description: Run a ContentHawk audit for the active campaign and manage campaigns — judge content against the enabled checks, open issues and fix PRs, and report status. Use when the user wants to run, advance, or manage a ContentHawk content audit.
---

# Run & manage ContentHawk campaigns

> 🚧 **v2 rewrite in progress (Phase 3).** This skill is being migrated from the old GitHub-Actions
> pipeline to the self-contained skill design. See `_docs/v2-design.md` (§4.3) for the intended
> behaviour: run the doctor preflight, apply each enabled check in `.contenthawk/checks/` to the
> active campaign's in-scope files, dedupe against existing findings/issues, open issues (grouped
> per file) and fix PRs (per file) per the `output` config, then report. Also lists/switches/closes
> campaigns.

Run `/contenthawk-install` to set up `.contenthawk/`, then `/contenthawk-add-campaign` to start a
campaign.
