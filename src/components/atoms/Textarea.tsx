import { clsx } from "clsx";
import type { ComponentPropsWithoutRef } from "react";

export type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={clsx(
        "border-cork-border/40 bg-cork-elevated/60 text-cork-text placeholder:text-cork-muted/50 block w-full min-w-0 resize-none rounded-lg border px-3 py-1.5 text-sm",
        className,
      )}
      {...props}
    />
  );
}
