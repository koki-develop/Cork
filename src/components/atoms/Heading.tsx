import { clsx } from "clsx";
import { createElement, type ReactNode } from "react";

type Level = 1 | 2 | 3;
type Variant = "hero" | "page" | "section" | "card";

export type HeadingProps = {
  level?: Level;
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

const variantStyles: Record<Variant, string> = {
  hero: "text-4xl font-bold tracking-tight",
  page: "text-lg font-bold tracking-tight",
  section: "text-sm font-semibold text-cork-text",
  card: "text-sm font-medium leading-snug text-cork-text",
};

export function Heading({ level = 1, variant = "page", className, children }: HeadingProps) {
  return createElement(
    `h${level}`,
    { className: clsx(variantStyles[variant], className) },
    children,
  );
}
