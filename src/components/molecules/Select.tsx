import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef, useState } from "react";

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
        className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-cork-text text-sm outline-none transition-colors duration-200 focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30"
      >
        {value}
        <ChevronDown
          className={`size-4 text-cork-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            className="absolute top-full right-0 left-0 z-10 mt-1 origin-top-left overflow-hidden rounded-lg border border-cork-border/40 bg-cork-elevated shadow-xl"
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
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-cork-text text-sm hover:bg-cork-accent/10"
              >
                {option.value === value && (
                  <Check className="size-3.5 shrink-0 text-cork-accent" />
                )}
                <span className={option.value === value ? "font-medium" : ""}>
                  {option.label}
                </span>
              </button>
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
