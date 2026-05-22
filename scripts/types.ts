export type CheckResult = "skipped" | "pending" | number;

export interface ContentItem {
  path: string;
  checkResult: CheckResult;
  checkedDate: string;
  lastUpdated: string;
  categoryList: string;
  createdDate: string;
}

export type ContentCatalog = Record<string, ContentItem[]>;

interface BaseItem {
  path: string;
  lastUpdated: string;
  checkedDate: string;
  categoryList: string;
  createdDate: string;
}

export type ResolvedItem =
  | ({ __typename: "pending" } & BaseItem)
  | ({ __typename: "skipped" } & BaseItem)
  | ({ __typename: "open_issue"; issueNumber: number } & BaseItem)
  | ({ __typename: "closed_issue"; issueNumber: number; stateReason: string | null } & BaseItem);

export type ResolvedCatalog = Record<string, ResolvedItem[]>;
