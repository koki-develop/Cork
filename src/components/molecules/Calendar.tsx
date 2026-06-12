import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export type CalendarProps = {
  /** Currently selected day, or null when nothing is picked. */
  value: Date | null;
  onSelect: (date: Date) => void;
  className?: string;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A self-contained month grid built on native `Date` (no date library). Tracks
 * the displayed month internally, seeded from `value` (or today). Every clickable
 * element `preventDefault`s its mousedown so opening it from a focused input
 * doesn't blur-close the host popover before the click lands — mirrors the
 * `TagSuggestionPopover` convention. Lives in molecules (not atoms) because it
 * owns navigation state.
 */
export function Calendar({ value, onSelect, className }: CalendarProps) {
  const today = new Date();
  const seed = value ?? today;
  const [view, setView] = useState({ year: seed.getFullYear(), month: seed.getMonth() });

  const firstOfMonth = new Date(view.year, view.month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const goPrev = () =>
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
    );
  const goNext = () =>
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
    );

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const navButton =
    "flex size-6 cursor-pointer items-center justify-center rounded-md text-cork-muted hover:bg-cork-accent/15 hover:text-cork-text";

  return (
    <div className={clsx("w-64 select-none", className)}>
      <div className="flex items-center justify-between px-1 pb-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={goPrev}
          aria-label="Previous month"
          className={navButton}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-cork-text text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={goNext}
          aria-label="Next month"
          className={navButton}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-cork-muted py-1 text-center text-[10px] font-medium">
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const cellDate = new Date(view.year, view.month, day);
          const selected = value !== null && isSameDay(cellDate, value);
          const isToday = isSameDay(cellDate, today);
          return (
            <button
              key={day}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(cellDate)}
              aria-label={cellDate.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              aria-pressed={selected}
              className={clsx(
                "flex h-7 cursor-pointer items-center justify-center rounded-md text-xs",
                selected ? "bg-cork-accent text-white" : "text-cork-text hover:bg-cork-accent/15",
                isToday && !selected && "ring-cork-accent/40 ring-1",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
