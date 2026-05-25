import React from "react";
import { renderToString } from "react-dom/server";
import { FormContent, SECRETS } from "./form-component.tsx";

export { SECRETS };

export function renderForm(targetRepo: string, token: string, css: string): string {
  const inner = renderToString(<FormContent targetRepo={targetRepo} token={token} />);
  const props = JSON.stringify({ targetRepo, token });
  const bundleSrc = `/bundle.js?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>ContentHawk \u2014 ${targetRepo}</title>
<style>${css}</style>
</head>
<body class="bg-ssw-gray-dark dark relative max-h-screen overflow-hidden">
  <div class="h-screen overflow-y-auto">
    <div class="flex items-center max-w-7xl mx-auto pt-6 gap-3">
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
