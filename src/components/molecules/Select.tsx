import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const rect = useAnchorRect(triggerRef, open);
  const pos = rect ? { top: rect.bottom + 4, left: rect.left, width: rect.width } : null;

  useClickOutside([triggerRef, dropdownRef], () => setOpen(false), open);
  useEscapeKey(() => setOpen(false), open);

  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (options.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          onChange(options[highlightedIndex].value);
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  });

  useEffect(() => {
    if (!open) return;
    const index = options.findIndex((o) => o.value === value);
    setHighlightedIndex(index >= 0 ? index : 0);
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, value, options]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="border-cork-border/40 bg-cork-elevated/60 text-cork-text flex w-full cursor-pointer items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
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
              data-floating-popup="true"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              className="border-cork-border/40 bg-cork-elevated fixed z-[60] origin-top-left overflow-hidden rounded-lg border shadow-xl"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {options.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
                    index === highlightedIndex
                      ? "bg-cork-accent/10 text-cork-text"
                      : "text-cork-text hover:bg-cork-accent/10"
                  }`}
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
        triggerRef.current?.closest("dialog") ?? document.body,
      )}
    </>
  );
}
