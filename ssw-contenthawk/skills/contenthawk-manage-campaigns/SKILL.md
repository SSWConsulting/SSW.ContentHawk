---
name: contenthawk-manage-campaigns
description: "Visualize and manage all active ContentHawk content campaigns for a target GitHub repository."
---

# ContentHawk — Manage Campaigns

You are preparing the arguments for `scripts/content-hawk.ts` in campaigns mode to do this you will read the state of all campaigns from markdown tables stored in the target repository.

## Schema (copy of the interfaces in `scripts/types.ts`)

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

interface CampaignData {
  done?: boolean;   // true when the snapshot comes from the DONE folder
  items: ContentItem[];
}

type ContentCatalog = Record<string, CampaignData>;
```

## Procedure

# Step 0 - Prerequisites

1. **Verify `gh` is authenticated.** Run `gh auth status`. If it fails, tell the user to run `gh auth login` and stop.
2. **Verify the user has their username set** in their GitHub CLI config. Run `git config --global user.name`. and `git config --global user.email`. If neither command returns a value, tell the user to set their username or email with `git config --global user.name "Your Name"` or `git config --global user.email "your.email@example.com"` and stop.


### Step 1 — Ask for the target repo

Ask the user: **Which GitHub repository would you like to manage campaigns for?** (format: `owner/repo`)

### Step 2 — Initialise ContentCatalog

Initialize an empty `ContentCatalog` object:

```typescript
const contentCatalog: ContentCatalog = {};
```

### Step 3 — Discover snapshot files

Use the GitHub REST API to list the contents of both the TODO and DONE folders in the target repo:

```bash
gh api repos/<owner/repo>/contents/.github/ContentHawk/TODO
gh api repos/<owner/repo>/contents/.github/ContentHawk/DONE
```

Each call returns a JSON array of file objects (or a 404 if the folder doesn't exist — handle gracefully by treating it as an empty list). Filter for entries where `name` ends with `.md`.

For each `.md` file from either folder, fetch its raw content using `WebFetch` on the file's `download_url` field from the API response.

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

Use the extracted Label as the key in `ContentCatalog`. The value must be a `CampaignData` object:
- `items`: the array of parsed `ContentItem`s
- `done`: `true` if the snapshot came from the `DONE` folder, omit (or `false`) for `TODO` snapshots.

### Step 4d — Order the catalog entries

The order of entries in `ContentCatalog` determines which campaign is shown as "Current" in the UI. Insert entries in this order:

1. **TODO campaigns first**, sorted by their date slug ascending (oldest date first — the date is the `YYYY-MM-DD` prefix of the snapshot filename). The oldest TODO campaign is the active one and will be marked "Current".
2. **DONE campaigns after**, also sorted by date slug ascending.

Lexicographic sort on the filename is sufficient because the `YYYY-MM-DD` prefix is zero-padded.

### Step 5 — Serialize and run

Serialize the `ContentCatalog` to a compact JSON string (no pretty-printing).

Run the workflow runner in campaigns mode:

```bash
npx ssw-contenthawk@latest campaigns <owner/repo> '<content-catalog-json>'
```

Replace `<owner/repo>` with the value from Step 1 and `<content-catalog-json>` with the serialized JSON.

When the command finishes executing it means the user has finished. If the user needs to view the campaign statuses again after the script has run, you will need to rebuild the `<content-catalog-json>` before running the command again by repeating steps 2-5.