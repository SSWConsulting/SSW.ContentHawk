import React, { useState, useEffect } from "react";
import { Card, CardContent } from "../components/ui/card";
import { CampaignStatusPanel, CampaignStatus } from "../components/campaign-status-panel";
import { CampaignItemsTable } from "../components/campaign-items-table";
import { CampaignActions } from "../components/campaign-actions";
import { fetchCampaignStatuses, fetchCampaignItems, fetchOpenIssueCounts } from "../services/contenthawk-service";
import type { ResolvedCatalog } from "../types";
import { PageShell } from "../components/page-shell";

export interface CampaignsPageProps {
  targetRepo: string;
}

export function CampaignsPage({ targetRepo }: CampaignsPageProps) {
  const [campaignStatuses, setCampaignStatuses] = useState<CampaignStatus[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ResolvedCatalog>({});
  const [openIssueCounts, setOpenIssueCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchCampaignStatuses().then((statuses) => {
      setCampaignStatuses(statuses);
      if (statuses.length > 0) setSelectedCampaign(statuses[0].name);
    });
    fetchCampaignItems().then(setCatalog);
    fetchOpenIssueCounts().then(setOpenIssueCounts);
  }, []);

  return (
    <PageShell>
      <Card className="max-w-7xl mx-auto my-16">
        <CardContent className="grid grid-cols-2 gap-6">
          <div className="col-span-2">
            <h1 className="text-xl mb-0 text-foreground">Campaigns</h1>
            <p className="text-muted-foreground font-mono mt-1 text-sm col-span-2">{targetRepo}</p>
          </div>
          {campaignStatuses.length > 0
            ? (
              <CampaignStatusPanel
                statuses={campaignStatuses}
                selectedCampaign={selectedCampaign}
                onSelectCampaign={setSelectedCampaign}
                className="col-span-1 mb-0"
              />
            )
            : <p className="text-sm text-muted-foreground col-span-1">No campaign data available.</p>}
          <CampaignActions
            openIssueCount={Object.values(openIssueCounts).reduce((sum, n) => sum + n, 0)}
            judgeStreamUrl="/run-judge"
            fixerStreamUrl="/run-fixer"
            issuesUrl={`https://github.com/${targetRepo}/issues?q=is:open+label:${encodeURIComponent(selectedCampaign ?? "")}`}
            pullsUrl={`https://github.com/${targetRepo}/pulls?q=is:open+label:${encodeURIComponent(selectedCampaign ?? "")}`}
            className="col-span-1 mt-0"
          />
          <CampaignItemsTable
            items={catalog[selectedCampaign ?? ""] ?? []}
            selectedCampaign={selectedCampaign}
            targetRepo={targetRepo}
            className="col-span-2 mt-0"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
