---
id: code-sample-validity
severity: medium
enabled: true
---

Flag fenced code blocks and inline commands that wouldn't work as written. Look for:

- References to APIs, functions, options, env vars, or CLI flags that don't exist (or no longer
  exist) in the project the docs describe.
- Commands that won't run: wrong package/binary name, removed subcommands, syntax errors, missing
  required arguments.
- Import paths, package names, or module names that don't match the codebase.
- Snippets inconsistent with the surrounding prose or with other snippets on the same page.
- A declared language fence that doesn't match the actual content.

Cross-check against the repo where possible (package manifests, source files, config). Don't flag
deliberately abbreviated pseudocode or `...` elisions that are clearly illustrative. Each finding
should name the specific invalid token and the correct form if known.
