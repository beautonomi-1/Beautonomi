/** Whether `now` falls inside the user's configured quiet-hours window (wall clock in `timezone`). */
export function isUserInQuietHours(
  prefs: Record<string, unknown> | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!prefs?.quiet_hours_enabled) return false;
  const tz =
    typeof timezone === "string" && timezone.trim() ? timezone.trim() : "Africa/Johannesburg";
  const nowHHMM = formatHHMMInTimezone(now, tz);
  const start = String(prefs.quiet_hours_start ?? "22:00");
  const end = String(prefs.quiet_hours_end ?? "07:00");
  if (start <= end) {
    return nowHHMM >= start && nowHHMM < end;
  }
  return nowHHMM >= start || nowHHMM < end;
}

export function formatHHMMInTimezone(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Africa/Johannesburg",
    }).format(now);
  }
}
