import React from "react";
import { hydrateRoot } from "react-dom/client";
import { InstallPage } from "./pages/install.tsx";
import { NewCampaignPage, CampaignsPage } from "./run-workflow-form-component.tsx";

const PAGES = {
  install: InstallPage,
  "new-campaign": NewCampaignPage,
  campaigns: CampaignsPage,
} as const;

const props = JSON.parse(document.getElementById("__PROPS__")!.textContent!);
const Component = PAGES[props.page as keyof typeof PAGES];

hydrateRoot(document.getElementById("app")!, <Component targetRepo={props.targetRepo} />);
