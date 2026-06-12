import { clsx } from "clsx";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAnchorRect } from "@/hooks/ui/useAnchorRect";
import { formatISODate, parseDate } from "@/lib/date";

import { Calendar } from "./Calendar";

export type DateFieldProps = {
  /** Canonical `YYYY-MM-DD` due date, or `""` for none. */
  value: string;
  /** Emits a canonical `YYYY-MM-DD`, or `""` to clear. */
  onChange: (date: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Single-date field: a text input that pops a `Calendar` on focus. Accepts both
 * calendar selection and direct `YYYY-MM-DD` typing (committed on blur / Enter,
 * reverted if invalid — same blur-save shape as the dialog's title field). The
 * popover is portaled into the closest `<dialog>` so it sits above the modal
 * backdrop, mirroring `TagEditor` / `TagSuggestionPopover`.
 */
export function DateField({
  value,
  onChange,
  ariaLabel = "Date",
  placeholder = "YYYY-MM-DD",
  className,
}: DateFieldProps) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Re-seed the editable text whenever the committed value changes (calendar
  // pick, clear, or a parent reset). Typing only mutates local `text` until a
  // commit flows back through `value`.
  useEffect(() => {
    setText(value);
  }, [value]);

  const rect = useAnchorRect(containerRef, open, [value]);
  const position = rect ? { top: rect.bottom + 4, left: rect.left } : null;

  const commitText = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      if (value !== "") onChange("");
      return;
    }
    const parsed = parseDate(trimmed);
    if (parsed) {
      const iso = formatISODate(parsed);
      if (iso !== value) onChange(iso);
      else setText(iso);
    } else {
      // Invalid input reverts to the last committed value.
      setText(value);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Focus moving into the calendar popover isn't a real blur. (Calendar
    // buttons preventDefault their mousedown, so this rarely fires, but guard
    // anyway.)
    if (e.relatedTarget instanceof Node && popoverRef.current?.contains(e.relatedTarget)) {
      return;
    }
    setOpen(false);
    commitText();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // Cmd/Ctrl+Enter is the enclosing dialog's submit shortcut — let it bubble.
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      commitText();
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      // Only swallow Escape while the calendar is open (to cancel it). When it's
      // already closed, let the event bubble to the dialog's Escape handler so
      // the field behaves like every other input (Escape closes the dialog).
      if (!open) return;
      e.preventDefault();
      e.stopPropagation();
      setText(value);
      setOpen(false);
    }
  };

  const handleCalendarSelect = (date: Date) => {
    const iso = formatISODate(date);
    // Set the text directly rather than relying on the value-change effect:
    // re-selecting the *same* date the field already holds leaves `value`
    // unchanged, so the effect wouldn't fire and a cleared input would stay
    // blank. Setting text here keeps the input in sync regardless.
    setText(iso);
    if (iso !== value) onChange(iso);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    if (value !== "") onChange("");
    setText("");
    inputRef.current?.focus();
  };

  // The calendar icon doubles as an open/close toggle so the popover can be
  // reopened after closing without having to blur and re-focus the input.
  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      commitText();
    } else {
      setOpen(true);
      inputRef.current?.focus();
    }
  };

  const selectedDate = parseDate(value);

  return (
    <>
      <div
        ref={containerRef}
        className={clsx(
          "border-cork-border/40 bg-cork-elevated/60 focus-within:ring-cork-accent/50 flex min-h-[34px] items-center gap-1 rounded-lg border px-2 py-1.5 focus-within:ring-2",
          className,
        )}
      >
        <button
          type="button"
          aria-label={open ? "Close calendar" : "Open calendar"}
          // Keep the input's focus (and avoid focusing the button) so toggling
          // doesn't fire a spurious blur-commit.
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleOpen}
          className="text-cork-muted hover:text-cork-text flex shrink-0 cursor-pointer items-center"
        >
          <CalendarIcon className="size-3.5" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label={ariaLabel}
          placeholder={placeholder}
          inputMode="numeric"
          className="text-cork-text placeholder:text-cork-muted/50 h-5 min-w-0 flex-1 border-none bg-transparent px-1 text-xs outline-none"
        />
        {value !== "" && (
          <button
            type="button"
            aria-label="Clear date"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="text-cork-muted/70 hover:text-cork-text flex shrink-0 cursor-pointer items-center"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {createPortal(
        <AnimatePresence>
          {open && position && (
            <m.div
              ref={popoverRef}
              data-floating-popup="true"
              style={{ top: position.top, left: position.left }}
              className="border-cork-border/40 bg-cork-elevated fixed z-[60] origin-top-left rounded-lg border p-2 shadow-xl"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <Calendar value={selectedDate} onSelect={handleCalendarSelect} />
            </m.div>
          )}
        </AnimatePresence>,
        containerRef.current?.closest("dialog") ?? document.body,
      )}
    </>
  );
}
