import { clsx } from "clsx";
import { ListFilter } from "lucide-react";
import type { Ref } from "react";

export type FilterButtonProps = {
  count: number;
  isOpen: boolean;
  onClick: () => void;
  ref?: Ref<HTMLButtonElement>;
};

export function FilterButton({ count, isOpen, onClick, ref }: FilterButtonProps) {
  const active = count > 0;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      className={clsx(
        "bg-cork-elevated/60 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors duration-200 outline-none",
        "hover:border-cork-border/60 hover:bg-cork-elevated",
        "focus-visible:ring-cork-accent focus-visible:ring-1",
        active ? "border-cork-accent/50 text-cork-text" : "border-cork-border/40 text-cork-muted",
      )}
    >
      <ListFilter className="size-3.5" />
      <span>Filter</span>
      {active && (
        <span className="bg-cork-accent ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium text-white">
          {count}
        </span>
      )}
    </button>
  );
}
