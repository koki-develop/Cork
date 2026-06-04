import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/atoms";

export type IconButtonProps = {
  icon: ReactNode;
  "aria-label": string;
  variant?: ButtonProps["variant"];
  color?: ButtonProps["color"];
  onClick?: ButtonProps["onClick"];
  className?: string;
};

export function IconButton({
  icon,
  "aria-label": ariaLabel,
  variant = "ghost",
  color = "default",
  onClick,
  className,
}: IconButtonProps) {
  return (
    <Button
      variant={variant}
      color={color}
      size="sm"
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      {icon}
    </Button>
  );
}
