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
