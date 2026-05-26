import React from "react";
import { hydrateRoot } from "react-dom/client";
import { InstallPage } from "./pages/install.tsx";
import { NewCampaignPage } from "./pages/new-campaign.tsx";
import { CampaignsPage } from "./pages/campaigns.tsx";

const PAGES = {
  install: InstallPage,
  "new-campaign": NewCampaignPage,
  campaigns: CampaignsPage,
} as const;

const props = JSON.parse(document.getElementById("__PROPS__")!.textContent!);
const Component = PAGES[props.page as keyof typeof PAGES];

hydrateRoot(document.getElementById("app")!, <Component targetRepo={props.targetRepo} />);
