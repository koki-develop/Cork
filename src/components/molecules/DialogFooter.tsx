import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/atoms";

type Action = {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  color?: ButtonProps["color"];
};

export type DialogFooterProps = {
  onCancel: () => void;
  cancelLabel?: string;
  cancelVariant?: "secondary" | "ghost";
  action: Action;
};

export function DialogFooter({
  onCancel,
  cancelLabel = "Cancel",
  cancelVariant = "secondary",
  action,
}: DialogFooterProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant={cancelVariant} size="md" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        type={action.type ?? "button"}
        variant="primary"
        color={action.color ?? "default"}
        size="md"
        onClick={action.onClick}
      >
        {action.icon}
        {action.label}
      </Button>
    </div>
  );
}
