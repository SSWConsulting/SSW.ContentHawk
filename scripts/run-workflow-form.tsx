import React from "react";
import { renderToString } from "react-dom/server";
import { NewCampaignPage, CampaignsPage } from "./run-workflow-form-component.tsx";

export function renderForm(
  targetRepo: string,
  token: string,
  css: string,
  page: "new-campaign" | "campaigns",
): string {
  const Component = page === "campaigns" ? CampaignsPage : NewCampaignPage;
  const inner = renderToString(<Component targetRepo={targetRepo} token={token} />);
  const props = JSON.stringify({ page, targetRepo, token });
  const bundleSrc = `/bundle.js?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>ContentHawk \u2014 ${targetRepo}</title>
<style>${css}</style>
</head>
<body class="bg-ssw-gray-dark dark relative max-h-screen overflow-hidden">
<div class="absolute top-4 left-4 z-10 flex items-center gap-2">
  <img src="/logo.png" alt="SSW" class="h-16 w-auto" />
  <span class="text-4xl tracking-wide"><span class="text-primary font-semibold">Content</span><span class="text-white font-light">Hawk</span></span>
</div>
<div id="app" class="h-screen overflow-y-auto" >${inner}</div>
<script id="__PROPS__" type="application/json">${props}</script>
<script src="${bundleSrc}"></script>
</body>
</html>`;
}