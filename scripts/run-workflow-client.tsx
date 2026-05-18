import React from "react";
import { hydrateRoot } from "react-dom/client";
import { RunWorkflowForm } from "./run-workflow-form-component.tsx";

const props = JSON.parse(document.getElementById("__PROPS__")!.textContent!);
hydrateRoot(
  document.getElementById("app")!,
  <RunWorkflowForm targetRepo={props.targetRepo} token={props.token} campaignStatuses={props.campaignStatuses ?? []} />,
);
