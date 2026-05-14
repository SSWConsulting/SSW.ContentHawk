import React from "react";

type Variant = "primary" | "secondary" | "green";

const variantClasses: Record<Variant, string> = {
  primary: "bg-[#0969da] text-white",
  secondary: "bg-[#6e7781] text-white",
  green: "bg-[#1a7f37] text-white",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`py-[0.55rem] px-[1.1rem] border-0 rounded font-semibold cursor-pointer text-[0.95rem] disabled:opacity-60 disabled:cursor-not-allowed ${variantClasses[variant]} ${className ?? ""}`}
    />
  );
}