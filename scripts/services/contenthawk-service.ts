import { CampaignStatus } from "../components/campaign-status-panel";
import type { ContentCatalog } from "../types.ts";

export async function fetchCampaignStatuses(token: string): Promise<CampaignStatus[]> {
  const res = await fetch(`/campaign-statuses?token=${encodeURIComponent(token)}`);
  if (!res.ok) return [];
  return res.json() as Promise<CampaignStatus[]>;
}

export async function fetchCampaignItems(token: string): Promise<ContentCatalog> {
  const res = await fetch(`/campaign-items?token=${encodeURIComponent(token)}`);
  if (!res.ok) return {};
  return res.json() as Promise<ContentCatalog>;
}