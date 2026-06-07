import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/atoms";

export type IconButtonProps = {
  icon: ReactNode;
  "aria-label": string;
  variant?: ButtonProps["variant"];
  color?: ButtonProps["color"];
  onClick?: ButtonProps["onClick"];
  onMouseDown?: ButtonProps["onMouseDown"];
  className?: string;
};

export function IconButton({
  icon,
  "aria-label": ariaLabel,
  variant = "ghost",
  color = "default",
  onClick,
  onMouseDown,
  className,
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      color={color}
      size="sm"
      onClick={onClick}
      onMouseDown={onMouseDown}
      className={className}
      aria-label={ariaLabel}
    >
      {icon}
    </Button>
  );
}
