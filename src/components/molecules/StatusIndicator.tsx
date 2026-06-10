import { clsx } from "clsx";

import { Text } from "@/components/atoms";

export type StatusIndicatorKind = "running" | "stopped" | "error";

export type StatusIndicatorProps = {
  kind: StatusIndicatorKind;
  label: string;
};

const dotClass: Record<StatusIndicatorKind, string> = {
  running: "bg-emerald-400",
  stopped: "bg-cork-muted",
  error: "bg-red-400",
};

const labelClass: Record<StatusIndicatorKind, string> = {
  running: "text-emerald-400",
  stopped: "text-cork-muted",
  error: "text-red-400",
};

export function StatusIndicator({ kind, label }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={clsx("inline-block size-2 rounded-full", dotClass[kind])}
      />
      <Text size="xs" className={labelClass[kind]}>
        {label}
      </Text>
    </span>
  );
}
