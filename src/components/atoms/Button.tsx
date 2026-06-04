import { clsx } from "clsx";
import type { ComponentPropsWithRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "dashed";
type Color = "default" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: Variant;
  color?: Color;
  size?: Size;
} & ComponentPropsWithRef<"button">;

const variantStyles: Record<Variant, Record<Color, string>> = {
  primary: {
    default:
      "bg-cork-accent text-white hover:bg-cork-accent-hover active:scale-[0.98] font-semibold",
    danger:
      "bg-red-500 text-white hover:bg-red-600 active:scale-[0.98] font-semibold",
  },
  secondary: {
    default:
      "border border-cork-border/40 text-cork-muted hover:bg-cork-elevated hover:text-cork-text font-medium",
    danger: "",
  },
  ghost: {
    default: "text-cork-muted hover:bg-cork-elevated hover:text-cork-text",
    danger: "text-red-400 hover:bg-red-500/10 hover:text-red-300",
  },
  dashed: {
    default:
      "border border-dashed border-cork-border/40 text-cork-muted hover:border-cork-border hover:bg-cork-elevated/50 hover:text-cork-text",
    danger: "",
  },
};

const sizeStyles: Record<Size, string> = {
  sm: "p-1.5",
  md: "px-4 py-2 text-xs",
  lg: "px-6 py-3 text-sm",
};

export function Button({
  variant = "ghost",
  color = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors duration-200 cursor-pointer",
        "disabled:opacity-40 disabled:pointer-events-none",
        variantStyles[variant][color],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
