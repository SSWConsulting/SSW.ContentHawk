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
