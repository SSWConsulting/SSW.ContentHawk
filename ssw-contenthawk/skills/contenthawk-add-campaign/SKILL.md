---
name: contenthawk-add-campaign
description: Start a new ContentHawk audit campaign in the current repository — snapshot the in-scope content and set it as the active campaign. Use when the user wants to begin or kick off a ContentHawk content audit.
---

# Start a ContentHawk campaign

> 🚧 **v2 rewrite in progress (Phase 2).** This skill is being migrated from the old GitHub-Actions
> pipeline to the self-contained skill design. See `_docs/v2-design.md` (§4.2) for the intended
> behaviour: run the doctor preflight, snapshot the in-scope files into
> `.contenthawk/campaigns/<id>/`, optionally open an umbrella tracking issue, and mark the campaign
> active.

If `.contenthawk/` doesn't exist yet, run `/contenthawk-install` first.
