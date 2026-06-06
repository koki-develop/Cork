import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

export type TagSuggestionPopoverProps = {
  open: boolean;
  suggestions: string[];
  selectedIndex: number;
  position: { top: number; left: number; width: number } | null;
  onSelect: (suggestion: string) => void;
  onHover: (index: number) => void;
  popoverRef?: Ref<HTMLDivElement>;
  /** Portal mount target. Defaults to document.body — pass the closest
   *  open <dialog> when rendered inside a modal so the popover joins the
   *  dialog's top layer and stays visible above the backdrop. */
  container?: Element;
};

export function TagSuggestionPopover({
  open,
  suggestions,
  selectedIndex,
  position,
  onSelect,
  onHover,
  popoverRef,
  container,
}: TagSuggestionPopoverProps) {
  return createPortal(
    <AnimatePresence>
      {open && suggestions.length > 0 && position && (
        <m.div
          ref={popoverRef}
          role="listbox"
          // data-floating-popup signals to host popovers (e.g.
          // TagFilterPopover) that this portal-rendered element should
          // be treated as "inside" for outside-click detection.
          data-floating-popup="true"
          style={{ top: position.top, left: position.left, width: position.width }}
          className="border-cork-border/60 bg-cork-surface fixed z-[60] max-h-[200px] origin-top-left overflow-y-auto rounded-lg border text-xs shadow-2xl"
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {suggestions.map((suggestion, index) => {
            const isHighlighted = index === selectedIndex;
            return (
              <button
                key={suggestion}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  // Prevent input blur before click handler runs
                  e.preventDefault();
                }}
                onMouseEnter={() => onHover(index)}
                onClick={() => onSelect(suggestion)}
                className={clsx(
                  "block w-full cursor-pointer px-2 py-1.5 text-left",
                  isHighlighted ? "bg-cork-accent/15 text-cork-accent-hover" : "text-cork-text",
                )}
              >
                {suggestion}
              </button>
            );
          })}
        </m.div>
      )}
    </AnimatePresence>,
    container ?? document.body,
  );
}
