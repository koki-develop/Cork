import { clsx } from "clsx";
import type { ReactNode } from "react";

export type ErrorBannerProps = {
  children: ReactNode;
  className?: string;
};

export function ErrorBanner({ children, className }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className={clsx(
        "rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400",
        className,
      )}
    >
      {children}
    </div>
  );
}
