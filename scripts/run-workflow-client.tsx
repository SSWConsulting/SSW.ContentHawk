import React from "react";
import { hydrateRoot } from "react-dom/client";
import { NewCampaignPage, CampaignsPage } from "./run-workflow-form-component.tsx";

const props = JSON.parse(document.getElementById("__PROPS__")!.textContent!);
const Component = props.page === "campaigns" ? CampaignsPage : NewCampaignPage;

hydrateRoot(
  document.getElementById("app")!,
  <Component targetRepo={props.targetRepo} token={props.token} />,
);