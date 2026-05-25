import React from "react";
import { cn } from "../lib/utils";

export type LogEvent = { type: "log"; message: string } | { type: "link"; message: string; url: string };

interface SseLogProps {
  entries: LogEvent[];
  className?: string;
}

export function SseLog({ entries, className }: SseLogProps) {
  if (entries.length === 0) return null;
  return (
    <div className={cn("text-xs bg-card border border-border rounded p-3 overflow-y-auto font-mono max-h-48", className)}>
      {entries.map((entry, i) =>
        entry.type === "link" ? (
          <a key={i} href={entry.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline whitespace-pre-wrap">
            {entry.message}
          </a>
        ) : (
          <span key={i} className="block whitespace-pre-wrap text-muted-foreground">
            {entry.message}
          </span>
        )
      )}
    </div>
  );
}
