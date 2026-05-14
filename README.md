# SSW.ContentHawk

ContentHawk is a GitHub Actions–based pipeline for auditing repository content. It uses Copilot-powered workflows to judge content, open issues, and create pull requests.

To use ContentHawk on a repository you want to audit, follow these setup steps.

---

## Installing ContentHawk

1. The ContentHawk installer can be downloaded using [npx skills](https://github.com/vercel-labs/skills). Run the command below to get the installer:

```bash
npx skills add -g SSWConsulting/SSW.ContentHawk

> Altenatively, you can install the skill directly for your your agent of choice like. The Example below showes you how to install the skill for claude.
> ```bash
> npx skills add -g SSWConsulting/SSW.ContentHawk --agent claude-code
> ```


2. Once you've added the installation skill, you can run it with the commande below using your agent of choice. Please note that the skill can be run in your CLI from anywhere. ContentHawk runs the installation over HTTP on a sparse clone of your repository.

```bash
/contenthawk-install
```

3. Follow along with the installer instructions to complete the setup. The installer will copy the required workflows and configuration files to your repository and set up secrets.

---



## Setup Instructions

### 1. Copy the `.github` folder

Copy the **entire `.github` folder** from this repository into the root of the repository you want to audit. This folder contains the workflows and configuration required for the ContentHawk pipeline.

### 2. Copilot: fine-grained access token

Create a **read-only, fine-grained personal access token** with:

- **Copilot Requests** enabled
- **Public repository** access (sufficient for public repos)

Store this token in a **repository secret** named:

- **`COPILOT_GITHUB_TOKEN`**

*(Settings → Secrets and variables → Actions → New repository secret.)*

### 4. Workflow permissions

In the repository you are auditing:

1. Go to **Settings → Actions → General**.
2. Under **Workflow permissions**, choose the option that allows **GitHub Actions to create and approve pull requests** (e.g. “Read and write permissions”).

Save the settings.

### 5. Tavily API key

Add a **repository secret** named:

- **`TAVILY_API_KEY`**


---

## Summary of required secrets

| Secret name           | Description |
|-----------------------|-------------|
| `COPILOT_GITHUB_TOKEN` | Read-only fine-grained token with Copilot Requests; public repo access is fine. |
| `CONTENTHAWK_GITHUB_PAT`      | Personal access token with Actions (read/write), Contents (read), Issues (read/write), Metadata (read). |
| `TAVILY_API_KEY`       | Tavily API Key |

After completing these steps, the ContentHawk workflows in the copied `.github` folder can run in your repository.

---

## Running the pipeline

The pipeline runs in four stages. Run them in order; **content-judge-pr** is triggered automatically by **content-judge**, so you only manually run three workflows.

**Flow:** `content-campaign` → `content-judge` → `content-judge-pr (auto)`  → `content-fixer`

### 1. Content Catalog (Agent 1)

**Workflow:** `content-campaign`  
**Actions → Content Catalog → Run workflow**

Creates a snapshot of content to audit, a custom label, and opens a pull request.


**Next:** Merge the “[Content Catalog] ...” PR to `main`. Note the **repo-relative path** to the snapshot file (e.g. `.github/ContentHawk/TODO/2026-03-05_Snapshot_archive-legacy-rules.md`) — you need it for the next steps.

---

### 2. Content Judge (Agent 2a)

**Workflow:** `content-judge`  
**Actions → Content Judge → Run workflow**

Reads the snapshot from `main`, reviews each file against the intent, and opens labelled issues. When it finishes, it **automatically** triggers **content-judge-pr**.

**Next:** **content-judge-pr** runs automatically and opens a “[Content Judge] …” PR that updates the snapshot with issue numbers. Merge that PR when ready.

---

### 3. Content Judge PR (Agent 2b) — automatic

**Workflow:** `content-judge-pr`  
**Triggered by:** content-judge when it completes.

Updates the snapshot with issue numbers and opens a PR. You do **not** run this manually in the normal flow.

---

### 4. Content Fixer (Agent 3)

**Workflow:** `content-fixer`  
**Actions → Content Fixer → Run workflow**

Groups open issues with the label into bundles and opens fix PRs that implement changes and close the linked issues.


Run this after the judge has created issues and you have merged the judge PR. You can run it multiple times as more issues are created or merged.

---

## Publishing a new version of the installer


### Install Script

The installer is published to npm as `ssw.contenthawk` and run via `npx ssw.contenthawk@latest <owner/repo>`. The Claude/AI **skill** (`ssw.contenthawk/skills/contenthawk-install`) is a thin wrapper that instructs the agent to invoke that `npx` command, so the same skill works with Claude Code or any other AI provider that can shell out. The installer itself is no longer bundled inside the skill.

To cut a new release:

1. Bump `version` in `package.json` using [npm version](https://docs.npmjs.com/cli/v8/commands/npm-version) with [semver](https://semver.org/).
2. Authenticate with npm if you haven't already by running `npm login`. Use SSW's NPM account in Keeper.
3. Get your code changes reviewed and merged to `main`.
4. Run `npm run build` to produce the bundled `dist/install.js` (and `dist/form.css`).
5. Run `npm publish` to push to npm. From then on `npx ssw.contenthawk@latest <owner/repo>` resolves to the new version.

### Skill

The skills in `ssw.contenthawk` are automatically published to the marketplace when merged to `main`. Their publication settings are defined in both the `.claude-plugin/marketplace.json` file at the root of the repo and the `.claude-plugin` folder(s) inside of `ssw.contenthawk`.