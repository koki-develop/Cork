import { clsx } from "clsx";
import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { TagChip } from "@/components/atoms";
import { useAnchorRect } from "@/hooks/ui/useAnchorRect";
import { useClickOutside } from "@/hooks/ui/useClickOutside";
import { isArrowDownKey, isArrowUpKey, isImeKeyEvent } from "@/lib/keyboard";
import { commitPending, fuzzySubsequenceMatch } from "@/lib/tags";

import { TagSuggestionPopover } from "./TagSuggestionPopover";

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
  ref?: Ref<TagEditorHandle>;
};

export function TagEditor({
  tags,
  onChange,
  ariaLabel = "Tags",
  placeholder = "Add tag",
  className,
  suggestions,
  maxTags,
  autoFocus,
  ref,
}: TagEditorProps) {
  const [pending, setPending] = useState("");
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [locallyRemoved, setLocallyRemoved] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionPopoverRef = useRef<HTMLDivElement>(null);
  const initialSuggestionsRef = useRef<Set<string> | null>(null);
  const refocusRequestedRef = useRef(false);
  const focusLastChipRequestedRef = useRef(false);

  // Capture the set of tags that existed in the workspace when this editor
  // mounted. Tags NOT in this set were typed by the user and don't exist in
  // the workspace yet — they should stay hidden from autocomplete after
  // deletion to prevent a flicker (the save hasn't completed yet, so they'd
  // briefly appear in suggestions and then disappear).
  if (!initialSuggestionsRef.current && suggestions) {
    initialSuggestionsRef.current = new Set(suggestions);
  }

  const isFull = maxTags !== undefined && tags.length >= maxTags;
  const suggestionsEnabled = suggestions !== undefined;

  const filteredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.filter(
      (s) => !tags.includes(s) && !locallyRemoved.includes(s) && fuzzySubsequenceMatch(s, pending),
    );
  }, [suggestions, pending, tags, locallyRemoved]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // focus() on a disabled input is a no-op — defer until re-render enables it.
  useEffect(() => {
    if (refocusRequestedRef.current && !isFull) {
      refocusRequestedRef.current = false;
      inputRef.current?.focus();
    }
  }, [isFull]);

  // When commit fills the editor, the input becomes disabled and browser
  // focus drops to <body>. Re-anchor focus to the last chip's remove
  // button so the next Tab continues from inside this row instead of
  // being pulled to the popover's first focusable.
  useEffect(() => {
    if (focusLastChipRequestedRef.current && isFull) {
      focusLastChipRequestedRef.current = false;
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[aria-label^="Remove tag "]',
      );
      buttons?.[buttons.length - 1]?.focus();
    }
  }, [isFull]);

  // Container size depends on tags/pending — recompute when they change.
  const popoverOpen = suggestionsEnabled && suggestionOpen;
  // The popover only actually renders when there are suggestions to show (see
  // TagSuggestionPopover). Keyboard interactions that belong to the popover
  // (arrow navigation, Escape-to-dismiss) must key off *visibility*, not the
  // raw open flag — otherwise an Escape while the popover is empty gets
  // silently swallowed here, forcing a second Escape to reach the dialog.
  const popoverVisible = popoverOpen && filteredSuggestions.length > 0;
  const containerRect = useAnchorRect(containerRef, popoverOpen, [tags.length, pending]);
  const suggestionPos = containerRect
    ? {
        top: containerRect.bottom + 4,
        left: containerRect.left,
        width: Math.max(containerRect.width, 200),
      }
    : null;

  useClickOutside(
    [containerRef, suggestionPopoverRef],
    () => setSuggestionOpen(false),
    suggestionOpen,
  );

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
    setSelectedIndex(-1);
    if (next !== tags) {
      onChange(next);
      if (maxTags !== undefined && next.length >= maxTags) {
        focusLastChipRequestedRef.current = true;
      }
    }
  };

  const removeAt = (index: number) => {
    const removed = tags[index];
    if (!initialSuggestionsRef.current?.has(removed)) {
      setLocallyRemoved((prev) => [...prev, removed]);
    }
    onChange(tags.filter((_, i) => i !== index));
    if (isFull) {
      refocusRequestedRef.current = true;
    } else {
      inputRef.current?.focus();
    }
  };

  const removeLast = () => {
    const removed = tags[tags.length - 1];
    if (!initialSuggestionsRef.current?.has(removed)) {
      setLocallyRemoved((prev) => [...prev, removed]);
    }
    onChange(tags.slice(0, -1));
  };

  /** Returns true if the key was handled by the suggestion popover (navigation/dismiss). */
  const handleSuggestionNavKey = (e: KeyboardEvent<HTMLInputElement>): boolean => {
    // Only intercept keys when the popover is actually on screen. When it isn't
    // (e.g. zero matches), Escape must fall through to close the enclosing
    // dialog instead of being consumed as a popover dismiss.
    if (!popoverVisible) return false;
    if (isArrowDownKey(e)) {
      e.preventDefault();
      setSelectedIndex((i) => (i < 0 ? 0 : (i + 1) % filteredSuggestions.length));
      return true;
    }
    if (isArrowUpKey(e)) {
      e.preventDefault();
      setSelectedIndex((i) =>
        i < 0
          ? filteredSuggestions.length - 1
          : (i - 1 + filteredSuggestions.length) % filteredSuggestions.length,
      );
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSuggestionOpen(false);
      return true;
    }
    return false;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME-generated keydowns (composition / confirm / cancel) belong to the
    // IME — letting them through would commit a pending tag on the Enter that
    // confirmed the conversion, or close the suggestion popover on the Esc
    // that cancelled it.
    if (isImeKeyEvent(e)) return;
    if (handleSuggestionNavKey(e)) return;

    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      // Cmd/Ctrl+Enter is a form-submit shortcut owned by the enclosing dialog —
      // don't consume it to commit an autocomplete suggestion. Letting it bubble
      // also avoids committing into stale `tags` state before submit reads it.
      if (e.key === "Enter" && e.metaKey) return;
      // Tab should select the highlighted suggestion when the autocomplete is
      // open, not move focus to the next element. Shift+Tab passes through.
      if (e.key === "Tab" && (e.shiftKey || !(popoverVisible && selectedIndex >= 0))) {
        return;
      }
      e.preventDefault();
      // Prefer selected suggestion if available and not already in tags
      if (popoverVisible) {
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
      removeLast();
    }
  };

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
    setSelectedIndex(-1);
    if (!pending.trim()) {
      setPending("");
      return;
    }
    tryCommit(pending);
  };

  const handleFocus = () => {
    if (suggestionsEnabled) setSuggestionOpen(true);
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
        onMouseDown={(e) => {
          // Clicks on the container's padding area (not on a child like a
          // TagChip or the input itself) should still focus the input.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        className={clsx(
          "border-cork-border/40 bg-cork-elevated/60 relative flex min-h-[34px] flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5",
          isFull ? "cursor-not-allowed" : "cursor-text",
          "focus-within:ring-cork-accent/50 focus-within:ring-2",
          className,
        )}
      >
        {tags.map((tag, i) => (
          <TagChip
            key={tag}
            label={tag}
            variant="accent"
            onRemove={() => removeAt(i)}
            className="cursor-text"
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={pending}
          onChange={(e) => {
            setPending(e.target.value);
            setSelectedIndex(e.target.value === "" ? -1 : 0);
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
      <TagSuggestionPopover
        open={popoverOpen}
        suggestions={filteredSuggestions}
        query={pending}
        selectedIndex={selectedIndex}
        position={suggestionPos}
        onSelect={handleSuggestionClick}
        onHover={setSelectedIndex}
        popoverRef={suggestionPopoverRef}
        // Portal into the enclosing <dialog> when the editor lives inside a
        // modal — body-portaled popovers are below the dialog's top layer
        // and would be hidden behind the backdrop.
        container={containerRef.current?.closest("dialog") ?? undefined}
      />
    </>
  );
}
