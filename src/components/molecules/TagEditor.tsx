import { clsx } from "clsx";
import { AnimatePresence, m } from "motion/react";
import {
  forwardRef,
  type KeyboardEvent,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { TagChip } from "@/components/atoms";

export type TagEditorHandle = {
  /** Drain the pending input text. Returns the trimmed value (or `""` if
   *  blank/already in `tags`) and clears the input. Does NOT call
   *  `onChange` — the caller decides whether to fold the value into a
   *  larger update payload or commit it as its own change. */
  flushPending: () => string;
};

export type TagEditorProps = {
  tags: string[];
  onChange: (next: string[]) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  suggestions?: string[];
  maxTags?: number;
  autoFocus?: boolean;
};

const commitPending = (current: string[], value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return current;
  if (current.includes(trimmed)) return current;
  return [...current, trimmed];
};

const fuzzySubsequenceMatch = (candidate: string, query: string): boolean => {
  if (!query) return true;
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  let ci = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ci < c.length && c[ci] !== q[qi]) ci++;
    if (ci === c.length) return false;
    ci++;
  }
  return true;
};

export const TagEditor = forwardRef<TagEditorHandle, TagEditorProps>(function TagEditor(
  {
    tags,
    onChange,
    ariaLabel = "Tags",
    placeholder = "Add tag",
    className,
    suggestions,
    maxTags,
    autoFocus,
  },
  ref,
) {
  const [pending, setPending] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suggestionPos, setSuggestionPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isFull = maxTags !== undefined && tags.length >= maxTags;
  const suggestionsEnabled = suggestions !== undefined;

  const filteredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.filter((s) => !tags.includes(s) && fuzzySubsequenceMatch(s, pending));
  }, [suggestions, pending, tags]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // eslint-disable-next-line react-hooks/exhaustive-deps: container size depends on tags/pending, recompute popover position when they change
  useLayoutEffect(() => {
    if (!suggestionsEnabled || !suggestionOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSuggestionPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 200),
    });
  }, [suggestionsEnabled, suggestionOpen, tags.length, pending]);

  useImperativeHandle(
    ref,
    () => ({
      flushPending: () => {
        const trimmed = pending.trim();
        setPending("");
        if (!trimmed || tags.includes(trimmed)) return "";
        return trimmed;
      },
    }),
    [tags, pending],
  );

  const tryCommit = (value: string) => {
    const next = commitPending(tags, value);
    setPending("");
    if (next !== tags) onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;

    if (suggestionsEnabled && suggestionOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) =>
          filteredSuggestions.length === 0 ? 0 : Math.min(i + 1, filteredSuggestions.length - 1),
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setSuggestionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      // Prefer selected suggestion if available and not already in tags
      if (suggestionsEnabled && suggestionOpen && filteredSuggestions.length > 0) {
        const candidate = filteredSuggestions[selectedIndex];
        if (candidate && !tags.includes(candidate)) {
          tryCommit(candidate);
          return;
        }
      }
      tryCommit(pending);
      return;
    }
    if (e.key === "Backspace" && pending === "" && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  const suggestionPopoverRef = useRef<HTMLDivElement>(null);

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Don't blur if focus moved to the suggestion popover (which lives outside
    // the container via position: fixed)
    if (
      suggestionsEnabled &&
      e.relatedTarget instanceof Node &&
      suggestionPopoverRef.current?.contains(e.relatedTarget)
    ) {
      return;
    }
    setSuggestionOpen(false);
    if (!pending.trim()) {
      setPending("");
      return;
    }
    tryCommit(pending);
  };

  const handleFocus = () => {
    if (suggestionsEnabled) setSuggestionOpen(true);
  };

  const removeAt = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
    inputRef.current?.focus();
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (tags.includes(suggestion)) return;
    tryCommit(suggestion);
    inputRef.current?.focus();
  };

  return (
    <>
      <div
        ref={containerRef}
        className={clsx(
          "border-cork-border/40 bg-cork-elevated/60 relative flex min-h-[34px] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5",
          "focus-within:border-cork-accent/50 focus-within:ring-cork-accent/30 focus-within:ring-1",
          className,
        )}
      >
        {tags.map((tag, i) => (
          <TagChip key={tag} label={tag} variant="accent" onRemove={() => removeAt(i)} />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={pending}
          onChange={(e) => {
            setPending(e.target.value);
            setSelectedIndex(0);
            if (suggestionsEnabled) setSuggestionOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          aria-label={ariaLabel}
          placeholder={tags.length === 0 ? placeholder : ""}
          disabled={isFull}
          className="text-cork-text placeholder:text-cork-muted/50 h-5 min-w-[60px] flex-1 border-none bg-transparent px-1 text-xs outline-none disabled:cursor-not-allowed"
        />
      </div>
      {createPortal(
        <AnimatePresence>
          {suggestionsEnabled &&
            suggestionOpen &&
            filteredSuggestions.length > 0 &&
            suggestionPos && (
              <m.div
                ref={suggestionPopoverRef}
                role="listbox"
                // data-floating-popup signals to host popovers (e.g.
                // TagFilterPopover) that this portal-rendered element should
                // be treated as "inside" for outside-click detection.
                data-floating-popup="true"
                style={{
                  top: suggestionPos.top,
                  left: suggestionPos.left,
                  width: suggestionPos.width,
                }}
                className="border-cork-border/60 bg-cork-surface fixed z-[60] max-h-[200px] origin-top-left overflow-y-auto rounded-lg border text-xs shadow-2xl"
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                {filteredSuggestions.map((suggestion, index) => {
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
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={clsx(
                        "block w-full cursor-pointer px-2 py-1.5 text-left",
                        isHighlighted
                          ? "bg-cork-accent/15 text-cork-accent-hover"
                          : "text-cork-text",
                      )}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </m.div>
            )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
});
