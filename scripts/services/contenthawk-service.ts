import { CampaignStatus } from "../components/campaign-status-panel";

export async function fetchCampaignStatuses(token: string): Promise<CampaignStatus[]> {
  const res = await fetch(`/campaign-statuses?token=${encodeURIComponent(token)}`);
  if (!res.ok) return [];
  return res.json() as Promise<CampaignStatus[]>;
}
