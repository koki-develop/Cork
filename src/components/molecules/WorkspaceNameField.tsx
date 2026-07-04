import { clsx } from "clsx";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type WorkspaceNameFieldProps = {
  name: string;
  onCommit: (name: string) => void;
  className?: string;
};

const PLACEHOLDER = "Untitled Workspace";
const TEXT_CLASSES = "text-base font-semibold";
// Breathing room for the caret so it doesn't sit flush against the last
// character once the input is sized to match the measured text exactly.
const CARET_BUFFER_PX = 2;

export function WorkspaceNameField({ name, onCommit, className }: WorkspaceNameFieldProps) {
  const [draft, setDraft] = useState(name);
  const isFocusedRef = useRef(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  // Neither WebKit's default focus handling nor a `mousedown`-based
  // outside-click listener (e.g. `useClickOutside`) can blur this field:
  // Tauri's own drag-region script (crates/tauri/src/window/scripts/drag.js)
  // listens for `mousedown` on `document` first, and for any click landing
  // inside the header's `data-tauri-drag-region="deep"` (everywhere but this
  // input) it calls `preventDefault()` (suppressing the browser's default
  // blur-on-mousedown) and `stopImmediatePropagation()` (silently killing
  // every other `document` `mousedown` listener, ours included). `click`
  // isn't touched by that script, so it's the one event that reliably still
  // reaches us.
  useEffect(() => {
    if (!isFocused) return;
    const handleDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (inputRef.current?.contains(event.target)) return;
      inputRef.current?.blur();
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [isFocused]);

  // Re-sync from the persisted value while the field isn't focused, so an
  // external change (another window, a direct .cork.json edit) shows up
  // live without clobbering an in-progress edit.
  useEffect(() => {
    if (!isFocusedRef.current) setDraft(name);
  }, [name]);

  // An <input>'s `size` attribute sizes by character *count*, which
  // over/undershoots badly for a proportional font (e.g. "0" is wider than
  // "i"). A same-styled offscreen span gives the real rendered width instead.
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    setWidth(measureRef.current.offsetWidth + CARET_BUFFER_PX);
  }, [draft]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value);

  const handleFocus = () => {
    isFocusedRef.current = true;
    setIsFocused(true);
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    setIsFocused(false);
    const trimmed = draft.trim();
    if (trimmed !== draft) setDraft(trimmed);
    if (trimmed !== name) onCommit(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden="true"
        className={clsx("pointer-events-none invisible absolute whitespace-pre", TEXT_CLASSES)}
      >
        {draft || PLACEHOLDER}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER}
        aria-label="Workspace name"
        style={{ width }}
        className={clsx(
          "text-cork-text placeholder:text-cork-muted/50 max-w-48 min-w-0 shrink-0 truncate border-0 bg-transparent p-0 outline-none",
          TEXT_CLASSES,
          className,
        )}
      />
    </>
  );
}
