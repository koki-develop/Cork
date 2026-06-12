import { clsx } from "clsx";
import { Calendar } from "lucide-react";

import { type DateCategory, describeDate, parseDate } from "@/lib/date";

export type DateBadgeProps = {
  /** Canonical `YYYY-MM-DD` due date. Renders nothing if empty or malformed. */
  date: string;
  className?: string;
};

// Text color per proximity bucket: overdue = danger, today = success (green),
// tomorrow = warning (orange), soon = accent (violet), far = muted. The three
// strong colors are dialed back slightly (/85) so they read a touch calmer on
// the card without losing their identity.
const CATEGORY_STYLES: Record<DateCategory, string> = {
  overdue: "text-cork-danger-text/85",
  today: "text-cork-success-text/85",
  tomorrow: "text-cork-warning-text/85",
  soon: "text-cork-accent-hover",
  far: "text-cork-muted",
};

export function DateBadge({ date, className }: DateBadgeProps) {
  const parsed = parseDate(date);
  if (!parsed) return null;

  // The clock is read at render time — DateBadge is a component, so the
  // proximity bucket reflects "now" each time the card paints.
  const today = new Date();
  const { category, label } = describeDate(parsed, today);

  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center gap-1 text-xs",
        CATEGORY_STYLES[category],
        className,
      )}
    >
      <Calendar className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
