# SSW.ContentHawk

ContentHawk is a GitHub Actions–based pipeline for auditing repository content. It uses Copilot-powered workflows to judge content, open issues, and create pull requests.

To use ContentHawk on a repository you want to audit, follow these setup steps.

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

### 3. Personal access token (installation repo)

Create a **personal access token (fine granined)** scoped to the repository you are auditing with these permissions:

| Permission | Access   |
|-----------|----------|
| Actions   | Read and write |
| Contents  | Read only      |
| Issues    | Read and write |
| Metadata  | Read only      |

Store this token in a **repository secret** named:

- **`TINA_GITHUB_PAT`**

*(Settings → Secrets and variables → Actions → New repository secret.)*

### 4. Workflow permissions

In the repository you are auditing:

1. Go to **Settings → Actions → General**.
2. Under **Workflow permissions**, choose the option that allows **GitHub Actions to create and approve pull requests** (e.g. “Read and write permissions”).

Save the settings.

### 5. Tavily API key

Add a **repository secret** named:

- **`TAVILY_API_KEY`**

*(Ask Caleb for the value for now.)*

---

## Summary of required secrets

| Secret name           | Description |
|-----------------------|-------------|
| `COPILOT_GITHUB_TOKEN` | Read-only fine-grained token with Copilot Requests; public repo access is fine. |
| `TINA_GITHUB_PAT`      | Personal access token with Actions (read/write), Contents (read), Issues (read/write), Metadata (read). |
| `TAVILY_API_KEY`       | Tavily API key (obtain from Caleb). |

After completing these steps, the ContentHawk workflows in the copied `.github` folder can run in your repository.

---

## Running the pipeline

The pipeline runs in four stages. Run them in order; **content-judge-pr** is triggered automatically by **content-judge**, so you only manually run three workflows.

**Flow:** `content-catalog` → `content-judge` → `content-judge-pr (auto)`  → `content-fixer`

### 1. Content Catalog (Agent 1)

**Workflow:** `content-catalog`  
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
