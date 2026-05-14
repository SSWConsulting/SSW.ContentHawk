---
description: Install GitHub Actions secrets on a target repo
argument-hint: [owner/repo]
allowed-tools: Bash(gh auth status:*), Bash(node ${CLAUDE_PLUGIN_ROOT}/commands/scripts/install.js:*)
---

Run the install script for the target repo: $ARGUMENTS

1. If `$ARGUMENTS` is empty, ask the user for the target repo in `owner/repo` form before continuing.
2. Verify `gh` is authenticated by running `gh auth status`. If it fails, tell the user to run `gh auth login` and stop.
3. Run `node ${CLAUDE_PLUGIN_ROOT}/commands/scripts/install.js "$ARGUMENTS"`. The script starts a local form server, prints a `http://127.0.0.1:<port>/?token=...` URL on stderr, and opens it in the user's browser. Secrets never appear in the transcript — they're entered into password fields and POSTed to localhost only.
<!-- 4. The script blocks until the form is submitted, then prints `Set: …`, `Skipped (empty): …`, and/or `Failed: …` lines and exits. Report those results back to the user verbatim. -->
