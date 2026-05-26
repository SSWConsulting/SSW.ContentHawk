import React from "react";
import { TooltipProvider } from "./ui/tooltip";

interface PageShellProps {
  className?: string;
  children: React.ReactNode;
}

export function PageShell({ children }: PageShellProps) {
  return (
    <>
      <div className="absolute inset-0 bg-cover -z-1 bg-[url('/polygon-bg.svg')] mix-blend-color-burn opacity-35" aria-hidden="true" />
      <TooltipProvider>
        {children}
      </TooltipProvider>
    </>
  );
}
