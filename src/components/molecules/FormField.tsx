import { clsx } from "clsx";
import type { ReactNode } from "react";

import { ErrorBanner, Text } from "@/components/atoms";

export type FormFieldProps = {
  label: string;
  children: ReactNode;
  error?: string | null;
  /** Extra classes on the field wrapper — e.g. `flex-1` so a control fills its column. */
  className?: string;
};

export function FormField({ label, children, error, className }: FormFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <Text variant="label" size="xs">
        {label}
      </Text>
      {children}
      {error && <ErrorBanner className="mt-1">{error}</ErrorBanner>}
    </div>
  );
}
