import { clsx } from "clsx";

export type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

export function Toggle({
  checked,
  onChange,
  "aria-label": ariaLabel,
  disabled,
  className,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors duration-200",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-cork-accent" : "bg-cork-elevated",
        className,
      )}
    >
      <span
        className={clsx(
          "inline-block size-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
