/**
 * Normalizes working_hours JSON to canonical Format A on write.
 *
 * Format A (canonical):
 *   { monday: { is_open: true, open_time: "09:00", close_time: "18:00" } }
 *
 * Format B (OperatingHoursEditor on web):
 *   { monday: { open: "09:00", close: "18:00", closed: false } }
 *
 * Both formats are accepted on read (see resolveWorkingHoursDay in load-constraints.ts).
 * This normalizer coerces Format B to Format A on save so only one shape is stored.
 */

const DAY_KEYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;

type DayKey = (typeof DAY_KEYS)[number];

interface FormatADay {
  is_open: boolean;
  open_time: string;
  close_time: string;
  breaks?: { start: string; end: string }[];
}

export function normalizeWorkingHours(
  wh: Record<string, any> | null | undefined,
): Record<string, FormatADay> | null {
  if (!wh || typeof wh !== "object") return null;

  const result: Record<string, FormatADay> = {};

  for (const key of Object.keys(wh)) {
    if (!DAY_KEYS.includes(key as DayKey)) continue;

    const day = wh[key];
    if (!day || typeof day !== "object") continue;

    // When both is_open and closed are present (mixed format from web editor spread),
    // 'closed' takes priority since it's the field the web OperatingHoursEditor toggles.
    // Without this, toggling a day "open" sets closed=false but the stale is_open=false wins.
    const hasClosed = day.closed !== undefined;
    const hasIsOpen = day.is_open !== undefined;
    const isClosed = hasClosed
      ? day.closed === true
      : hasIsOpen
        ? day.is_open === false
        : false;
    const openTime = (day.open_time || day.open || "09:00").toString().trim();
    const closeTime = (day.close_time || day.close || "18:00").toString().trim();

    const normalized: FormatADay = {
      is_open: !isClosed,
      open_time: isClosed ? "09:00" : openTime,
      close_time: isClosed ? "18:00" : closeTime,
    };

    if (Array.isArray(day.breaks) && day.breaks.length > 0) {
      normalized.breaks = day.breaks
        .filter((b: any) => b && typeof b === "object" && b.start && b.end)
        .map((b: any) => ({ start: b.start.toString().trim(), end: b.end.toString().trim() }));
    }

    result[key] = normalized;
  }

  if (Object.keys(result).length === 0) return null;

  // Ensure all 7 days are present so partial saves don't leave gaps
  // that resolveWorkingHoursDay treats as closed
  for (const dayKey of DAY_KEYS) {
    if (!result[dayKey]) {
      result[dayKey] = { is_open: true, open_time: "09:00", close_time: "18:00" };
    }
  }

  return result;
}
