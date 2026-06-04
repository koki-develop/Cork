import { GripVertical } from "lucide-react";
import type { Ref } from "react";

export type DragHandleProps = {
  handleRef: Ref<HTMLButtonElement>;
  "aria-label": string;
};

export function DragHandle({
  handleRef,
  "aria-label": ariaLabel,
}: DragHandleProps) {
  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={ariaLabel}
      className="inline-flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-cork-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cork-accent/50 active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}
