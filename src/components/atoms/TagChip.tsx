import { clsx } from "clsx";
import { X } from "lucide-react";

export type TagChipVariant = "muted" | "accent";

export type TagChipProps = {
  label: string;
  variant?: TagChipVariant;
  onRemove?: () => void;
  className?: string;
};

const VARIANT_STYLES: Record<TagChipVariant, { chip: string; remove: string }> =
  {
    muted: {
      chip: "border-cork-accent/25 bg-cork-accent/10 text-cork-accent-hover/80",
      remove: "text-cork-accent-hover/60 hover:text-cork-text",
    },
    accent: {
      chip: "border-cork-accent/40 bg-cork-accent/20 font-medium text-cork-accent-hover",
      remove: "text-cork-accent-hover/70 hover:text-cork-text",
    },
  };

export function TagChip({
  label,
  variant = "muted",
  onRemove,
  className,
}: TagChipProps) {
  const styles = VARIANT_STYLES[variant];
  return (
    <span
      className={clsx(
        "inline-flex h-5 max-w-[140px] items-center gap-1 rounded-full border px-2 text-xs",
        styles.chip,
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${label}`}
          onClick={onRemove}
          className={clsx(
            "-mr-0.5 flex shrink-0 cursor-pointer items-center justify-center rounded-full",
            styles.remove,
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
