import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAnchorRect } from "@/hooks/ui/useAnchorRect";
import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { useEscapeKey } from "@/hooks/ui/useEscapeKey";

export type SelectOption = {
  label: string;
  value: string;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
};

export function Select({ value, onChange, options }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const rect = useAnchorRect(triggerRef, open);
  const pos = rect ? { top: rect.bottom + 4, left: rect.left, width: rect.width } : null;

  useClickOutside([triggerRef, dropdownRef], () => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="border-cork-border/40 bg-cork-elevated/60 text-cork-text focus:border-cork-accent/50 focus:ring-cork-accent/30 flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 outline-none focus:ring-1"
      >
        {options.find((o) => o.value === value)?.label ?? value}
        <ChevronDown
          className={`text-cork-muted size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <m.div
              ref={dropdownRef}
              // data-floating-popup signals to host popovers (e.g.
              // TagFilterPopover) that this portal-rendered element should be
              // treated as "inside" for outside-click detection.
              data-floating-popup="true"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              className="border-cork-border/40 bg-cork-elevated fixed z-[60] origin-top-left overflow-hidden rounded-lg border shadow-xl"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="text-cork-text hover:bg-cork-accent/10 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm"
                >
                  {option.value === value ? (
                    <Check className="text-cork-accent size-3.5 shrink-0" />
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                  <span className={option.value === value ? "font-medium" : ""}>
                    {option.label}
                  </span>
                </button>
              ))}
            </m.div>
          )}
        </AnimatePresence>,
        // Portal into the enclosing <dialog> when the select lives inside a
        // modal — body-portaled popups are below the dialog's top layer
        // and would be hidden behind the backdrop.
        triggerRef.current?.closest("dialog") ?? document.body,
      )}
    </>
  );
}
