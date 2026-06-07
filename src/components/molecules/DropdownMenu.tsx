import { AnimatePresence, m } from "motion/react";
import { type ReactNode, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { useEscapeKey } from "@/hooks/ui/useEscapeKey";

import { MenuList } from "./MenuList";

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

export function DropdownMenu({ trigger, triggerAriaLabel, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside([ref], () => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={triggerAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-cork-muted hover:bg-cork-elevated hover:text-cork-text inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 transition-colors duration-200"
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            data-floating-popup="true"
            className="border-cork-border/40 bg-cork-elevated absolute top-full right-0 z-20 mt-1 w-max origin-top-right overflow-hidden rounded-lg border shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <MenuList items={items} onSelect={() => setOpen(false)} />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
