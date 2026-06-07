import { clsx } from "clsx";
import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
} from "react";

export type AutoresizeInputProps = Omit<ComponentPropsWithoutRef<"textarea">, "rows">;

export function AutoresizeInput({
  value,
  onChange,
  onKeyDown,
  className,
  ...props
}: AutoresizeInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Resize on every value change so the box grows with content and shrinks
  // when text is deleted. `height: auto` lets the textarea collapse to its
  // intrinsic size so scrollHeight reflects the content rather than the
  // previously-applied size. The border-height adjustment is needed because
  // scrollHeight excludes border but the box-sizing: border-box `height`
  // includes it — without it every line is clipped by the border width.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cs = getComputedStyle(el);
    const borderH = Number.parseFloat(cs.borderTopWidth) + Number.parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + borderH}px`;
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    // Convert newlines to spaces so this behaves like a single-line <input>
    // that wraps visually. Covers paste and IME input paths too.
    if (/[\r\n]/.test(event.target.value)) {
      event.target.value = event.target.value.replace(/[\r\n]+/g, " ");
    }
    onChange?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event);
    if (event.key === "Enter" && !event.defaultPrevented) {
      event.preventDefault();
    }
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={clsx(
        "border-cork-border/40 bg-cork-elevated/60 text-cork-text block w-full resize-none overflow-hidden rounded-lg border px-3 py-1.5 text-sm",
        "placeholder:text-cork-muted/50",
        className,
      )}
      {...props}
    />
  );
}
