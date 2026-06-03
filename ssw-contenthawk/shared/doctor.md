# ContentHawk doctor — preflight checks

Shared preflight run at the start of every ContentHawk skill. Run the checks **in order**. On the
first failure, print the exact remedy shown and **STOP** — do not continue the skill.

`gh auth login` and `gh auth refresh` are interactive, so the user must run them. Tell them to type
the command in this session prefixed with `!` (e.g. `! gh auth login`) so its output lands here.

## Checks

1. **`gh` is installed** — run `gh --version`.
   - Fail → "Install the GitHub CLI from https://cli.github.com, then re-run this skill." STOP.

2. **`gh` is authenticated** — run `gh auth status`.
   - Fail → "Run `! gh auth login` and complete the browser flow, then re-run this skill." STOP.

3. **Token has the scopes to write issues, branches, and PRs** — inspect the scopes line from
   `gh auth status`.
   - Classic token must include **`repo`**. Fine-grained tokens must grant **Contents**,
     **Pull requests**, and **Issues** (read/write).
   - Missing → "Run `! gh auth refresh -s repo` (classic) or re-issue your fine-grained token with
     Contents + Pull requests + Issues read/write, then re-run this skill." STOP.

4. **Git identity is set** (needed so ContentHawk's commits are attributed) — run
   `git config user.name` and `git config user.email`.
   - Either empty → "Set them with `git config --global user.name \"Your Name\"` and
     `git config --global user.email \"you@example.com\"`, then re-run this skill." STOP.

5. **Working directory is a GitHub repo** — run `gh repo view --json nameWithOwner -q .nameWithOwner`.
   - Fail → "Open this skill from inside the GitHub repository you want to audit (it needs a GitHub
     `origin` remote)." STOP.
   - Success → remember the `owner/repo`; later steps and `gh` calls use it.

## Campaign-skill-only check

`contenthawk-add-campaign` and `contenthawk-manage-campaigns` additionally require:

6. **`.contenthawk/` exists** — check for `.contenthawk/config.yml` in the repo root.
   - Missing → "ContentHawk isn't set up in this repo yet. Run `/contenthawk-install` first." STOP.
