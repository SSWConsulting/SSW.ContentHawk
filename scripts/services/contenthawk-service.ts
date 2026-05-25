import { CampaignStatus } from "../components/campaign-status-panel";
import type { ResolvedCatalog } from "../types.ts";

export async function fetchCampaignStatuses(): Promise<CampaignStatus[]> {
  const res = await fetch("/campaign-statuses");
  if (!res.ok) return [];
  return res.json() as Promise<CampaignStatus[]>;
}

export async function fetchCampaignItems(): Promise<ResolvedCatalog> {
  const res = await fetch("/campaign-items");
  if (!res.ok) return {};
  return res.json() as Promise<ResolvedCatalog>;
}

export async function fetchOpenIssueCounts(): Promise<Record<string, number>> {
  const res = await fetch("/open-issue-counts");
  if (!res.ok) return {};
  return res.json() as Promise<Record<string, number>>;
}
