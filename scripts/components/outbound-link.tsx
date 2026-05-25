import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";

interface OutboundLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function OutboundLink({ href, children, className }: OutboundLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5 text-sm text-primary underline font-mono", className)}
    >
      <ExternalLink className="size-3.5 shrink-0" />
      {children}
    </a>
  );
}