import { clsx } from "clsx";
import { ListFilter } from "lucide-react";
import { forwardRef } from "react";

export type FilterButtonProps = {
  count: number;
  isOpen: boolean;
  onClick: () => void;
};

export const FilterButton = forwardRef<HTMLButtonElement, FilterButtonProps>(
  function FilterButton({ count, isOpen, onClick }, ref) {
    const active = count > 0;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={clsx(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border bg-cork-elevated/60 px-3 text-xs outline-none transition-colors duration-200",
          "hover:border-cork-border/60 hover:bg-cork-elevated",
          "focus-visible:ring-1 focus-visible:ring-cork-accent",
          active
            ? "border-cork-accent/50 text-cork-text"
            : "border-cork-border/40 text-cork-muted",
        )}
      >
        <ListFilter className="size-3.5" />
        <span>Filter</span>
        {active && (
          <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-cork-accent px-1 font-medium text-[10px] text-white">
            {count}
          </span>
        )}
      </button>
    );
  },
);
