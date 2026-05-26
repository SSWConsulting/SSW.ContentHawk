import React from "react";
import { Check, Info, X, AlertTriangle } from "lucide-react";

interface MessageProps {
  children?: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info";
}

const VARIANT_CONFIG: Record<
  NonNullable<MessageProps["variant"]>,
  { container: string; icon: React.ReactNode }
> = {
  info: {
    container: "after:border-blue-500",
    icon: <Info size={15} />,
  },
  success: {
    container: "after:border-green-500",
    icon: <Check size={15} className="text-green-500" />,
  },
  error: {
    container: "after:border-primary",
    icon: <X size={15} className="text-primary" />,
  },
  warning: {
    container: "after:border-orange-500",
    icon: <AlertTriangle size={15} className="text-orange-500" />,
  },
};

export function Message({ children, variant }: MessageProps) {
  if (!variant || !children) return null;
  const { container, icon } = VARIANT_CONFIG[variant];
  return (
    <div className={`relative overflow-hidden px-3 py-2 bg-ssw-gray-dark rounded my-4 text-sm after:absolute after:inset-0 after:border-l-2 after:z-10 ${container}`}>
      <div className="z-20 flex items-center gap-2">  
        <span className="mt-0.5 shrink-0">
          {icon}
        </span>
          {children}
        </div>
    </div>
  );
}
