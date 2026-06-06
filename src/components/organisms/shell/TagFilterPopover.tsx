import { Plus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type KeyboardEvent, type RefObject, useEffect, useEffectEvent, useRef } from "react";

import { Button, Text } from "@/components/atoms";
import { FilterRow } from "@/components/molecules";
import { useAnchorRect } from "@/hooks/ui/useAnchorRect";
import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { isValidFilter } from "@/lib/filter";
import type { TagFilter } from "@/types";

export type TagFilterPopoverProps = {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  filters: TagFilter[];
  onFiltersChange: (next: TagFilter[]) => void;
  availableTags: string[];
};

export function TagFilterPopover({
  isOpen,
  onClose,
  anchorRef,
  filters,
  onFiltersChange,
  availableTags,
}: TagFilterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const firstRowRef = useRef<HTMLDivElement>(null);

  const rect = useAnchorRect(anchorRef, isOpen);
  const position = rect
    ? { top: rect.bottom + 4, right: globalThis.innerWidth - rect.right }
    : null;

  useClickOutside([popoverRef, anchorRef], onClose, isOpen, { ignorePortalPopups: true });

  // Set initial focus only when the popover opens — not on every filter
  // add/remove. Reading `filters.length` here is intentionally stale-safe
  // because the effect only fires on `isOpen` transition.
  // eslint-disable-next-line react-hooks/exhaustive-deps: only refocus on open transition
  useEffect(() => {
    if (!isOpen) return;
    if (filters.length === 0) {
      addButtonRef.current?.focus();
    } else {
      const select = firstRowRef.current?.querySelector<HTMLButtonElement>("button[type='button']");
      select?.focus();
    }
  }, [isOpen]);

  // Prune empty-operand filters on close transition (regardless of trigger).
  // The popover keeps them around while open so the user can keep typing without
  // them disappearing; once it closes without them being filled in, drop them.
  // Wrapped as an Effect Event so the close effect reads the latest filters /
  // onFiltersChange without re-subscribing on every change.
  const pruneInvalidFilters = useEffectEvent(() => {
    const valid = filters.filter(isValidFilter);
    if (valid.length !== filters.length) {
      onFiltersChange(valid);
    }
  });

  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (wasOpen && !isOpen) {
      pruneInvalidFilters();
      anchorRef.current?.focus();
    }
  }, [isOpen, anchorRef]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const handleAddFilter = () => {
    const next: TagFilter[] = [
      ...filters,
      { id: crypto.randomUUID(), operator: "contains", tags: [] },
    ];
    onFiltersChange(next);
  };

  const handleRowChange = (index: number, next: TagFilter) => {
    onFiltersChange(filters.map((f, i) => (i === index ? next : f)));
  };

  const handleRowRemove = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    onFiltersChange([]);
  };

  const isEmpty = filters.length === 0;
  const validCount = filters.filter(isValidFilter).length;

  return (
    <AnimatePresence>
      {isOpen && position && (
        <m.div
          ref={popoverRef}
          role="dialog"
          aria-label="Filter tasks"
          onKeyDown={handleKeyDown}
          className="border-cork-border/60 bg-cork-surface fixed z-40 flex max-h-[80vh] w-[480px] origin-top-right flex-col overflow-hidden rounded-xl border shadow-2xl"
          style={{ top: position.top, right: position.right }}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          <div className="border-cork-border/40 flex items-center justify-between border-b px-4 py-2.5">
            <Text size="sm" className="text-cork-text font-semibold">
              Filters ({validCount})
            </Text>
            {filters.length > 0 && (
              <Button
                variant="ghost"
                size="md"
                onClick={handleClearAll}
                className="!px-2 !py-1 text-xs"
              >
                Clear all
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto p-4">
            {isEmpty ? (
              <div className="flex justify-center">
                <Text variant="muted" size="xs">
                  No filters applied
                </Text>
              </div>
            ) : (
              filters.map((filter, index) => (
                <div key={filter.id} ref={index === 0 ? firstRowRef : undefined}>
                  {index > 0 && (
                    <div className="my-2 flex items-center gap-2">
                      <div className="border-cork-border/30 flex-1 border-t" />
                      <span className="text-cork-muted/50 text-[10px] tracking-wider uppercase">
                        and
                      </span>
                      <div className="border-cork-border/30 flex-1 border-t" />
                    </div>
                  )}
                  <FilterRow
                    filter={filter}
                    onChange={(next) => handleRowChange(index, next)}
                    onRemove={() => handleRowRemove(index)}
                    availableTags={availableTags}
                  />
                </div>
              ))
            )}
          </div>
          <div className="border-cork-border/40 border-t px-4 py-2.5">
            <Button ref={addButtonRef} variant="dashed" size="md" onClick={handleAddFilter}>
              <Plus className="size-3.5" />
              Add filter
            </Button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
