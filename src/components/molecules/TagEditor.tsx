import { clsx } from "clsx";
import {
  forwardRef,
  type KeyboardEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
};

const commitPending = (current: string[], value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return current;
  if (current.includes(trimmed)) return current;
  return [...current, trimmed];
};

export const TagEditor = forwardRef<TagEditorHandle, TagEditorProps>(
  function TagEditor(
    { tags, onChange, ariaLabel = "Tags", placeholder = "Add tag", className },
    ref,
  ) {
    const [pending, setPending] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

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

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const next = commitPending(tags, pending);
        setPending("");
        if (next !== tags) onChange(next);
        return;
      }
      if (e.key === "Backspace" && pending === "" && tags.length > 0) {
        e.preventDefault();
        onChange(tags.slice(0, -1));
      }
    };

    const handleBlur = () => {
      if (!pending.trim()) {
        setPending("");
        return;
      }
      const next = commitPending(tags, pending);
      setPending("");
      if (next !== tags) onChange(next);
    };

    const removeAt = (index: number) => {
      onChange(tags.filter((_, i) => i !== index));
      inputRef.current?.focus();
    };

    return (
      <div
        className={clsx(
          "flex min-h-[34px] flex-wrap items-center gap-1.5 rounded-lg border border-cork-border/40 bg-cork-elevated/60 px-2 py-1.5",
          "focus-within:border-cork-accent/50 focus-within:ring-1 focus-within:ring-cork-accent/30",
          className,
        )}
      >
        {tags.map((tag, i) => (
          <TagChip
            key={tag}
            label={tag}
            variant="accent"
            onRemove={() => removeAt(i)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={pending}
          onChange={(e) => setPending(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          aria-label={ariaLabel}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="h-5 min-w-[60px] flex-1 border-none bg-transparent px-1 text-cork-text text-xs outline-none placeholder:text-cork-muted/50"
        />
      </div>
    );
  },
);
