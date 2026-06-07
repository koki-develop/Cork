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

  // Container size depends on tags/pending — recompute when they change.
  const popoverOpen = suggestionsEnabled && suggestionOpen;
  const containerRect = useAnchorRect(containerRef, popoverOpen, [tags.length, pending]);
  const suggestionPos = containerRect
    ? {
        top: containerRect.bottom + 4,
        left: containerRect.left,
        width: Math.max(containerRect.width, 200),
      }
    : null;

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
    if (next !== tags) onChange(next);
  };

  const removeAt = (index: number) => {
    const removed = tags[index];
    if (!initialSuggestionsRef.current?.has(removed)) {
      setLocallyRemoved((prev) => [...prev, removed]);
    }
    onChange(tags.filter((_, i) => i !== index));
    inputRef.current?.focus();
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
    if (!suggestionsEnabled || !suggestionOpen) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => {
        if (filteredSuggestions.length === 0) return 0;
        if (i < 0) return 0;
        return (i + 1) % filteredSuggestions.length;
      });
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => {
        if (filteredSuggestions.length === 0) return 0;
        if (i < 0) return filteredSuggestions.length - 1;
        return (i - 1 + filteredSuggestions.length) % filteredSuggestions.length;
      });
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
    // WebKit (Safari / Tauri WKWebView) fires compositionend BEFORE the
    // keydown that confirmed the IME, so isComposing is already false by
    // the time we get here and the Enter would commit the pending tag.
    // keyCode is 229 for IME-generated key events (13 for a real Enter) —
    // deprecated but the only reliable cross-browser signal for this case.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (handleSuggestionNavKey(e)) return;

    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      // Cmd/Ctrl+Enter is a form-submit shortcut owned by the enclosing dialog —
      // don't consume it to commit an autocomplete suggestion. Letting it bubble
      // also avoids committing into stale `tags` state before submit reads it.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return;
      // Tab should select the highlighted suggestion when the autocomplete is
      // open, not move focus to the next element. Shift+Tab passes through.
      if (
        e.key === "Tab" &&
        (e.shiftKey ||
          !(
            suggestionsEnabled &&
            suggestionOpen &&
            filteredSuggestions.length > 0 &&
            selectedIndex >= 0
          ))
      ) {
        return;
      }
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
          "focus-within:border-cork-accent/50 focus-within:ring-cork-accent/30 focus-within:ring-1",
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
