---
name: contenthawk-install
description: Install SSW ContentHawk on a target GitHub repository by setting the required GitHub Actions secrets. Use when the user wants to set up, install, or configure ContentHawk on a GitHub repo, or asks to add ContentHawk secrets to a repository.
---

# Install SSW ContentHawk on a target repo

ContentHawk is a GitHub Actions pipeline for auditing repository content. Installing it on a target repo requires setting several GitHub Actions secrets via the `gh` CLI.

## Steps

1. **Determine the target repo.** If the user hasn't already provided one, ask them for it in `owner/repo` form before continuing.
2. **Verify `gh` is authenticated.** Run `gh auth status`. If it fails, tell the user to run `gh auth login` and stop.
3. **Run the installer.** Run `npx ssw-contenthawk@latest <owner/repo>`.

The installer starts a local form server on `127.0.0.1`, prints a `http://127.0.0.1:<port>/?token=...` URL on stderr, and opens it in the user's browser. Secrets never appear in the transcript — they're entered into password fields and POSTed to localhost only.
<!-- The script blocks until the form is submitted, then prints `Set: ...`, `Skipped (empty): ...`, and/or `Failed: ...` lines and exits. Report those results back to the user verbatim. -->
