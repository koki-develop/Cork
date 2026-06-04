import { clsx } from "clsx";
import { createElement, type ReactNode } from "react";

type As = "p" | "span";
type Variant = "body" | "muted" | "mono" | "label";
type Size = "xs" | "sm";

export type TextProps = {
  as?: As;
  variant?: Variant;
  size?: Size;
  truncate?: boolean;
  className?: string;
  children: ReactNode;
};

const variantStyles: Record<Variant, string> = {
  body: "text-cork-text",
  muted: "text-cork-muted",
  mono: "font-mono text-cork-muted",
  label: "font-medium uppercase tracking-wider text-cork-muted",
};

const sizeStyles: Record<Size, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

export function Text({
  as = "span",
  variant = "body",
  size = "sm",
  truncate = false,
  className,
  children,
}: TextProps) {
  return createElement(
    as,
    {
      className: clsx(
        variantStyles[variant],
        sizeStyles[size],
        truncate && "truncate",
        className,
      ),
    },
    children,
  );
}
