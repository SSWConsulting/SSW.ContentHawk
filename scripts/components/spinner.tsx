import { LoaderCircle } from "lucide-react";
import { cn } from "../lib/utils";
import React from "react";

export function Spinner({ size = 15, className }: { size?: number; className?: string }) {
  return <LoaderCircle size={size} className={cn("animate-spin shrink-0", className)} />;
}