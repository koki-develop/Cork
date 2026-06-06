import type { ReactNode } from "react";

import { ErrorBanner, Text } from "@/components/atoms";

export type FormFieldProps = {
  label: string;
  children: ReactNode;
  error?: string | null;
};

export function FormField({ label, children, error }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text variant="label" size="xs">
        {label}
      </Text>
      {children}
      {error && <ErrorBanner className="mt-1">{error}</ErrorBanner>}
    </div>
  );
}
