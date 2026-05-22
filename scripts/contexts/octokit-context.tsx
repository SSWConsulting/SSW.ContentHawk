import React, { createContext, useContext, useMemo } from "react";
import { Octokit } from "@octokit/rest";

const OctokitContext = createContext<Octokit | null>(null);

export function OctokitProvider({ children }: { children: React.ReactNode }) {
  const octokit = useMemo(() => new Octokit(), []);
  return <OctokitContext.Provider value={octokit}>{children}</OctokitContext.Provider>;
}

export function useOctokit(): Octokit {
  const ctx = useContext(OctokitContext);
  if (!ctx) throw new Error("useOctokit must be used within OctokitProvider");
  return ctx;
}
