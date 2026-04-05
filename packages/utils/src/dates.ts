/**
 * Date formatting utilities
 */

import { format, formatDistanceToNow, parseISO } from "date-fns";

export function formatDate(date: string | Date, fmt = "PPP"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * `Date` values become ISO strings when round-tripped through JSON (e.g. localStorage).
 * Use this before calling `Date` instance methods in UI.
 */
export function coerceSelectedDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Calendar date in the **device / runtime local** timezone (`YYYY-MM-DD`).
 * Use for availability and waitlist `date` query params when the user picks a day on a calendar.
 * Do **not** use `date.toISOString().split("T")[0]` for that — it is the **UTC** calendar date and
 * can be wrong for users ahead of UTC (e.g. evening in Johannesburg maps to previous UTC day).
 */
export function formatLocalDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalizes any `Date`-parsable value (including ISO strings with `Z` or `±hh:mm`) to UTC ISO 8601 (`…Z`).
 * Use for booking/hold payloads that must satisfy `z.string().datetime()` (RFC 3339).
 */
export function toIsoUtcTimestamp(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date/time");
  }
  return d.toISOString();
}
