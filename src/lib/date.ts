/**
 * Due-date helpers. Pure functions over the canonical `YYYY-MM-DD` string and
 * native `Date`, with all comparison done by *local* calendar day. `today` is
 * always passed in (never read from the clock here) so the logic stays pure and
 * the lib layer's "no side effects" rule holds.
 */

export type DateCategory = "overdue" | "today" | "tomorrow" | "soon" | "far";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Parse a strict canonical `YYYY-MM-DD` string into a local-midnight `Date`,
 * or null if malformed. Built via `new Date(y, m-1, d)` (NOT `new Date(str)`,
 * which parses as UTC and shifts to the previous day in negative-offset zones).
 * Rejects values the constructor would silently roll over (e.g. `2026-02-30`).
 */
export function parseDate(s: string): Date | null {
  if (!ISO_DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Format a `Date` as canonical `YYYY-MM-DD` using its local calendar day. */
export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole-day difference (`date` − `today`) by local calendar day. */
function diffInDays(date: Date, today: Date): number {
  // Round to the nearest day so DST transitions (23h / 25h days) don't skew it.
  return Math.round((startOfDay(date).getTime() - startOfDay(today).getTime()) / MS_PER_DAY);
}

/**
 * Bucket a due date by proximity to today:
 * overdue (past) / today / tomorrow / soon (2–6 days) / far (≥7 days).
 * Weekday-name display is capped at `soon` because a 7-day-out date shares
 * today's weekday name and would be ambiguous.
 */
export function classifyDate(date: Date, today: Date): DateCategory {
  const diff = diffInDays(date, today);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff <= 6) return "soon";
  return "far";
}

/**
 * Bucket a due date and build its card label in one pass (so the proximity
 * computation isn't repeated). The label is:
 * - `Today` / `Tomorrow` for the named days,
 * - a weekday name (`Monday`) within the next week,
 * - an absolute short date (`Jun 5`) for overdue / far dates, with the year
 *   appended (`Jun 5, 2027`) whenever the due date falls in a different
 *   calendar year than today — so a cross-year date is never shown bare.
 *
 * Weekday and month names are pinned to `en-US` so the board reads consistently
 * in English regardless of locale.
 */
export function describeDate(date: Date, today: Date): { category: DateCategory; label: string } {
  const category = classifyDate(date, today);
  switch (category) {
    case "today":
      return { category, label: "Today" };
    case "tomorrow":
      return { category, label: "Tomorrow" };
    case "soon":
      return { category, label: date.toLocaleDateString("en-US", { weekday: "long" }) };
    case "overdue":
    case "far": {
      const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
      if (date.getFullYear() !== today.getFullYear()) options.year = "numeric";
      return { category, label: date.toLocaleDateString("en-US", options) };
    }
  }
}
