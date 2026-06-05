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
        "bg-cork-elevated text-cork-muted flex size-5 items-center justify-center rounded-md text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}
