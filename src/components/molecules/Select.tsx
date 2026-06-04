import { Check, ChevronDown } from "lucide-react";
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
        className="flex w-full items-center justify-between rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-3 py-1.5 text-sm text-cork-text outline-none transition-colors duration-200 focus:border-cork-accent/50 focus:ring-1 focus:ring-cork-accent/30"
      >
        {value}
        <ChevronDown
          className={`size-4 text-cork-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-cork-border/40 bg-cork-elevated shadow-xl">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-cork-text transition-colors duration-150 hover:bg-cork-accent/10"
            >
              {option.value === value && (
                <Check className="size-3.5 shrink-0 text-cork-accent" />
              )}
              <span className={option.value === value ? "font-medium" : ""}>
                {option.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
