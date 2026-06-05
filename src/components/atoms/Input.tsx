import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

export type InputProps = ComponentPropsWithRef<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={clsx(
        "border-cork-border/40 bg-cork-elevated/60 text-cork-text min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 outline-none",
        "placeholder:text-cork-muted/50",
        "focus:border-cork-accent/50 focus:ring-cork-accent/30 focus:ring-1",
        className,
      )}
      {...props}
    />
  );
}
