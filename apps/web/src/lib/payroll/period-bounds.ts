import { buildZonedIsoForWallClock } from "@beautonomi/utils";

export const DEFAULT_PAYROLL_TIMEZONE = "Africa/Johannesburg";

/** Normalise API/UI date input to YYYY-MM-DD (calendar day in salon TZ). */
export function toPayPeriodDateString(input: Date | string): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (!Number.isFinite(d.getTime())) throw new Error("Invalid pay period date");
    return d.toISOString().slice(0, 10);
  }
  if (!Number.isFinite(input.getTime())) throw new Error("Invalid pay period date");
  return input.toISOString().slice(0, 10);
}

/**
 * Inclusive pay-period bounds in UTC for ledger queries.
 * `startDate` / `endDate` are calendar dates (YYYY-MM-DD) in the salon timezone.
 */
export function resolvePayPeriodBounds(
  startDate: Date | string,
  endDate: Date | string,
  timezone: string | null | undefined = DEFAULT_PAYROLL_TIMEZONE,
): { from: Date; to: Date; timezone: string } {
  const startStr = toPayPeriodDateString(startDate);
  const endStr = toPayPeriodDateString(endDate);
  if (endStr < startStr) {
    throw new Error("pay_period_end must be on or after pay_period_start");
  }

  const tz = timezone?.trim() || DEFAULT_PAYROLL_TIMEZONE;
  const fromIso = buildZonedIsoForWallClock(startStr, "00:00", tz);
  const toIso = buildZonedIsoForWallClock(endStr, "23:59", tz);
  const to = new Date(toIso);
  to.setSeconds(59, 999);

  return {
    from: new Date(fromIso),
    to,
    timezone: tz,
  };
}

/** Calendar day (YYYY-MM-DD) for a timestamp in the salon timezone. */
export function calendarDayInTimezone(
  instant: Date | string,
  timezone: string | null | undefined = DEFAULT_PAYROLL_TIMEZONE,
): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const tz = timezone?.trim() || DEFAULT_PAYROLL_TIMEZONE;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}
