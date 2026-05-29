#### 1. Copy the `.github` folder

Copy the **entire `.github` folder** from this repository into the root of you GitHub content repository **(excluding `.github/actions/publish.yml`)**. This folder contains the workflows required for the ContentHawk pipeline.

#### 2. Copilot: fine-grained access token

Under **GitHub | Your Profile | Settings | Developer settings | Personal access tokens | Fine-grained tokens (classic) | Generate new token**, create a **read-only, fine-grained personal access token** with:

- **Copilot Requests** enabled
- **Public repository** access (sufficient for public repos)

Store this token in a **repository secret** named:

- **`COPILOT_GITHUB_TOKEN`**

*(Settings → Secrets and variables → Actions → New repository secret.)*

#### 4. Workflow permissions

In the repository you are auditing:

1. Go to **Settings → Actions → General**.
2. Under **Workflow permissions**, choose the option that allows **GitHub Actions to create and approve pull requests** (e.g. “Read and write permissions”).

Save the settings.

#### 5. Tavily API key

Add a **repository secret** named:

- **`TAVILY_API_KEY`**


---

## Summary of required secrets

| Secret name           | Description |
|-----------------------|-------------|
| `COPILOT_GITHUB_TOKEN` | Read-only fine-grained token with Copilot Requests; public repo access is fine. |
| `TAVILY_API_KEY`       | Tavily API Key |

After completing these steps, you have finished installing ContentHawk on your repository.
---