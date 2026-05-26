import React from "react";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export function FormInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={`focus-visible:border-primary focus-visible:ring-primary/50 ${props.className ?? ""}`}
    />
  );
}

export function FormTextarea(props: React.ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      {...props}
      className={`focus-visible:border-primary focus-visible:ring-primary/50 ${props.className ?? ""}`}
    />
  );
}