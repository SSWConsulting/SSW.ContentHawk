---
name: contenthawk-install
description: Install SSW ContentHawk on a target GitHub repository by setting the required GitHub Actions secrets. Use when the user wants to set up, install, or configure ContentHawk on a GitHub repo, or asks to add ContentHawk secrets to a repository.
---

# Install SSW ContentHawk on a target repo

ContentHawk is a GitHub Actions pipeline for auditing repository content. Installing it on a target repo requires setting several GitHub Actions secrets via the `gh` CLI.

## Steps

1. **Determine the target repo.** If the user hasn't already provided one, ask them for it in `owner/repo` form before continuing.
2. **Verify `gh` is authenticated.** Run `gh auth status`. If it fails, tell the user to run `gh auth login` and stop.
3. **Verify the correct agentic workflows CLI is installed** run `gh aw --version`. Ensure the version matches the one specified in `github/gh-aw-actions` `https://raw.githubusercontent.com/SSWConsulting/SSW.ContentHawk/refs/heads/main/.github/aw/actions-lock.json`. If the CLI fails tell the user to install the correct version from listed from the `actions-lock.json` and stop.
4. **Run the installer.** Run `npx ssw-contenthawk@latest <owner/repo>`.

The installer starts a local form server on `127.0.0.1`, prints a `http://127.0.0.1:<port>/?token=...` URL on stderr, and opens it in the user's browser. When the process exits tell the thank the user for running the installer and tell them to re-run the skill if any issues occurred.