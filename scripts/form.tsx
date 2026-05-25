import React from "react";
import { renderToString } from "react-dom/server";
import { InstallPage, SECRETS } from "./pages/install.tsx";
import { NewCampaignPage, CampaignsPage } from "./run-workflow-form-component.tsx";

export { SECRETS };

type Page = "install" | "new-campaign" | "campaigns";

export function renderForm(targetRepo: string, css: string, page: Page = "install"): string {
  let inner: string;
  let props: string;

  if (page === "install") {
    inner = renderToString(<InstallPage targetRepo={targetRepo} />);
    props = JSON.stringify({ page, targetRepo });
  } else if (page === "campaigns") {
    inner = renderToString(<CampaignsPage targetRepo={targetRepo} />);
    props = JSON.stringify({ page, targetRepo });
  } else {
    inner = renderToString(<NewCampaignPage targetRepo={targetRepo} />);
    props = JSON.stringify({ page, targetRepo });
  }

  const bundleSrc = "/bundle.js";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>ContentHawk \u2014 ${targetRepo}</title>
<style>${css}</style>
</head>
<body class="bg-ssw-gray-dark dark relative max-h-screen overflow-hidden">
  <div class="h-screen overflow-y-auto">
    <div class="flex items-center max-w-7xl mx-auto pt-6 gap-3 select-none">
      <img src="/ssw-logo.png" alt="SSW" class="h-13 w-auto" />
      <span class="text-4xl tracking-wide"><span class="text-primary font-semibold">Content</span><span class="text-white font-light">Hawk</span></span>
    </div>
    <div id="app">
      ${inner}
    </div>
  </div>
<script id="__PROPS__" type="application/json">${props}</script>
<script src="${bundleSrc}"></script>
</body>
</html>`;
}