import { clsx } from "clsx";
import { Hash } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { Ref } from "react";
import { createPortal } from "react-dom";

import { fuzzySubsequenceMatchIndices } from "@/lib/tags";

export type TagSuggestionPopoverProps = {
  open: boolean;
  suggestions: string[];
  /** Current input text. Used to bold the fuzzy-matched characters in each
   *  suggestion. Optional — when omitted, labels render unstyled. */
  query?: string;
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

function HighlightedLabel({ label, query }: { label: string; query: string | undefined }) {
  if (!query) return <>{label}</>;
  const indices = fuzzySubsequenceMatchIndices(label, query);
  if (!indices || indices.length === 0) return <>{label}</>;
  const matched = new Set(indices);
  const chars = Array.from(label);
  return (
    <>
      {chars.map((ch, i) =>
        matched.has(i) ? (
          <span key={i} className="text-cork-accent-hover font-semibold">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

export function TagSuggestionPopover({
  open,
  suggestions,
  query,
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
          className="border-cork-border/40 bg-cork-elevated fixed z-[60] max-h-[200px] origin-top-left overflow-y-auto rounded-lg border p-1 text-xs shadow-xl"
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
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150",
                  isHighlighted
                    ? "bg-cork-accent/15 text-cork-text"
                    : "text-cork-muted hover:bg-cork-accent/5 hover:text-cork-text",
                )}
              >
                <Hash
                  className={clsx(
                    "size-3 shrink-0 transition-colors",
                    isHighlighted ? "text-cork-accent-hover" : "text-cork-muted/60",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">
                  <HighlightedLabel label={suggestion} query={query} />
                </span>
              </button>
            );
          })}
        </m.div>
      )}
    </AnimatePresence>,
    container ?? document.body,
  );
}
