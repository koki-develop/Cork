import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type DropdownMenuItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  color?: "default" | "danger";
};

export type DropdownMenuProps = {
  trigger: ReactNode;
  triggerAriaLabel: string;
  items: [DropdownMenuItem, ...DropdownMenuItem[]];
};

const itemColorStyles: Record<
  NonNullable<DropdownMenuItem["color"]>,
  string
> = {
  default: "text-cork-text hover:bg-cork-accent/10",
  danger: "text-red-400 hover:bg-red-500/10 hover:text-red-300",
};

export function DropdownMenu({
  trigger,
  triggerAriaLabel,
  items,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={triggerAriaLabel}
        className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-cork-muted transition-colors duration-200 hover:bg-cork-elevated hover:text-cork-text"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            className="absolute top-full right-0 z-20 mt-1 w-max origin-top-right overflow-hidden rounded-lg border border-cork-border/40 bg-cork-elevated shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={clsx(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150",
                  itemColorStyles[item.color ?? "default"],
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
