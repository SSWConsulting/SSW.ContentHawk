import React from "react";

interface MessageProps {
  children?: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info";
}

const VARIANT_CLASSES: Record<NonNullable<MessageProps["variant"]>, string> = {
  info:    "bg-[#ddf4ff] border border-[#54aeff]",
  success: "bg-[#dafbe1] border border-[#2da44e]",
  error:   "bg-[#ffebe9] border border-[#cf222e]",
  warning: "bg-[#fff8c5] border border-[#d4a72c]",
};

export function Message({ children, variant }: MessageProps) {
  if (!variant || !children) return null;
  return (
    <div className={`px-3 py-2 rounded my-4 text-sm ${VARIANT_CLASSES[variant]}`}>
      {children}
    </div>
  );
}