import { X } from "lucide-react";

import { Heading } from "@/components/atoms";

import { IconButton } from "./IconButton";

export type DialogHeaderProps = {
  title: string;
  onClose: () => void;
  closeAriaLabel?: string;
};

export function DialogHeader({ title, onClose, closeAriaLabel = "Close" }: DialogHeaderProps) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Heading level={2} variant="page">
        {title}
      </Heading>
      <IconButton
        icon={<X className="size-4" />}
        aria-label={closeAriaLabel}
        onClick={onClose}
        // Keep focus on the active field so its blur-driven save handler
        // doesn't race the close click.
        onMouseDown={(e) => e.preventDefault()}
      />
    </div>
  );
}
