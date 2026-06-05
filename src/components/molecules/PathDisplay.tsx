import { clsx } from "clsx";
import { FolderOpen } from "lucide-react";

import { Text } from "@/components/atoms";

type BaseProps = {
  path: string;
  className?: string;
};

type ReadonlyProps = BaseProps & {
  onClick?: undefined;
  "aria-label"?: undefined;
};

type ButtonProps = BaseProps & {
  onClick: () => void;
  "aria-label": string;
};

export type PathDisplayProps = ReadonlyProps | ButtonProps;

export function PathDisplay(props: PathDisplayProps) {
  const { path, className } = props;

  if (props.onClick) {
    const { onClick, "aria-label": ariaLabel } = props;
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={clsx(
          "border-cork-border/40 bg-cork-elevated/60 text-cork-text hover:border-cork-border/60 hover:bg-cork-elevated/90 flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors",
          className,
        )}
      >
        <span className="flex-1 truncate">{path}</span>
        <FolderOpen className="text-cork-muted size-3.5 shrink-0" />
      </button>
    );
  }

  return (
    <Text as="span" variant="mono" size="xs" truncate className={clsx("max-w-64", className)}>
      {path}
    </Text>
  );
}
