import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";

import type { DropdownMenuItem } from "./DropdownMenu";

export type ContextMenuProps = {
  items: [DropdownMenuItem, ...DropdownMenuItem[]];
  position: { x: number; y: number } | null;
  onClose: () => void;
};

const itemColorStyles: Record<NonNullable<DropdownMenuItem["color"]>, string> = {
  default: "text-cork-text hover:bg-cork-accent/10",
  danger: "text-red-400 hover:bg-red-500/10 hover:text-red-300",
};

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handleClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [position, onClose]);

  return (
    <div ref={wrapperRef} className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {position && (
          <m.div
            key={`${position.x}-${position.y}`}
            className="border-cork-border/40 bg-cork-elevated pointer-events-auto fixed z-50 w-max origin-top-left overflow-hidden rounded-lg border shadow-xl"
            style={{ left: position.x, top: position.y }}
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
                  onClose();
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
