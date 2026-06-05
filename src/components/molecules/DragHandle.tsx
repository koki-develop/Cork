import { GripVertical } from "lucide-react";
import type { Ref } from "react";

export type DragHandleProps = {
  handleRef: Ref<HTMLButtonElement>;
  "aria-label": string;
};

export function DragHandle({ handleRef, "aria-label": ariaLabel }: DragHandleProps) {
  return (
    <button
      ref={handleRef}
      type="button"
      aria-label={ariaLabel}
      className="text-cork-muted focus-visible:ring-cork-accent/50 inline-flex size-5 shrink-0 cursor-grab items-center justify-center rounded focus-visible:ring-1 focus-visible:outline-none active:cursor-grabbing"
    >
      <GripVertical className="size-3.5" />
    </button>
  );
}
