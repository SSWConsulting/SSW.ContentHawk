---
description: "Read all ContentHawk TODO snapshots, build a ContentCatalog JSON argument, and run the workflow runner for a target GitHub repo."
allowed-tools: Read, Bash, WebFetch
---

# ContentHawk — Workflow Runner

You are preparing the arguments for `scripts/run-workflow.ts`.

## ContentItem schema (copy of the interface in `scripts/run-workflow.ts`)

```typescript
type CheckResult = "skipped" | "pending" | number; // number = GitHub issue number e.g. 15

interface ContentItem {
  path: string;
  checkResult: CheckResult;
  checkedDate: string;    // "YYYY-MM-DD" or "-"
  lastUpdated: string;    // "YYYY-MM-DD" or "-"
  categoryList: string;
  createdDate: string;    // "YYYY-MM-DD"
}

type ContentCatalog = Record<string, ContentItem[]>;
```

## Procedure

### Step 1 — Ask for the target repo

Ask the user: **Which GitHub repository should the workflow run on?** (format: `owner/repo`)


### Step 2 - Initialise ContentCatalog

Initialize an empty `ContentCatalog` object:

```typescript
const contentCatalog: ContentCatalog = {};

```

### Step 3 — Discover snapshot files

Use the GitHub REST API to list the contents of the TODO folder in the target repo:

```bash
gh api repos/<owner/repo>/contents/.github/ContentHawk/TODO
```

This returns a JSON array of file objects. Filter for entries where `name` ends with `.md`.

For each `.md` file, fetch its raw content using `WebFetch` on the file's `download_url` field from the API response.

### Step 4 — Parse each snapshot file

For each file:


#### 4a. Extract the Label

Find the `## Agent Configuration` section and locate the row where the first column is `Label`. Extract the value (strip surrounding backticks if present). This is the **catalog key** for this file.

#### 4b. Parse the Files to Review table

Find the `## Files to Review` section. Parse every data row (skip the header and separator rows). For each row, map the columns to a `ContentItem`:

| Markdown column | ContentItem field | Notes |
|---|---|---|
| `Path` | `path` | Use as-is |
| `CategoryList` | `categoryList` | Use as-is |
| `Created` | `createdDate` | Use as-is (`YYYY-MM-DD` or `-`) |
| `LastUpdated` | `lastUpdated` | Use as-is (`YYYY-MM-DD` or `-`) |
| `CheckedDate` | `checkedDate` | Use as-is (`YYYY-MM-DD` or `-`) |
| `CheckResult` | `checkResult` | See parsing rules below |

**CheckResult parsing rules:**
- `pending` → `"pending"`
- `skipped` → `"skipped"`
- `Issue #<N>` (e.g. `Issue #101`) → the integer `N` (e.g. `101`)
- Any other value → `"pending"`

### 4c. Populate the ContentCatalog
Use the extracted Label as the key in `ContentCatalog`, and append array of parsed `ContentItem`s as the value. 

### Step 5 — Serialize and run

Serialize the `ContentCatalog` to a compact JSON string (no pretty-printing).

Run the workflow runner:

```bash
npx tsx scripts/run-workflow.ts <owner/repo> '<content-catalog-json>'
```

Replace `<owner/repo>` with the value from Step 1 and `<content-catalog-json>` with the serialized JSON.
