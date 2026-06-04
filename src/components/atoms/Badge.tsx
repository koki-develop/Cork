import { clsx } from "clsx";
import type { ReactNode } from "react";

export type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "flex size-5 items-center justify-center rounded-md bg-cork-elevated text-xs font-medium text-cork-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
