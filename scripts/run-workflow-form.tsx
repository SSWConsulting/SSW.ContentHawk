import React from "react";
import { renderToString } from "react-dom/server";
import { RunWorkflowForm } from "./run-workflow-form-component.tsx";

export function renderForm(
  targetRepo: string,
  token: string,
  css: string,
): string {
  const inner = renderToString(
    <RunWorkflowForm targetRepo={targetRepo} token={token} />,
  );
  const props = JSON.stringify({ targetRepo, token });
  const bundleSrc = `/bundle.js?token=${encodeURIComponent(token)}`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Run ContentHawk Workflow \u2014 ${targetRepo}</title>
<style>${css}</style>
</head>
<body class="bg-ssw-gray-dark dark relative max-h-screen overflow-hidden">
<img src="/logo.png" alt="SSW" class="absolute top-4 left-4 h-16 w-auto z-10" />
<div id="app" class="h-screen overflow-y-auto" >${inner}</div>
<script id="__PROPS__" type="application/json">${props}</script>
<script src="${bundleSrc}"></script>
</body>
</html>`;
}
