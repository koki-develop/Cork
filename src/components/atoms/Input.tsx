import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

export type InputProps = ComponentPropsWithRef<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={clsx(
        "min-w-0 flex-1 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-sm text-cork-text outline-none transition-colors duration-200",
        "placeholder:text-cork-muted/50",
        "focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30",
        className,
      )}
      {...props}
    />
  );
}
