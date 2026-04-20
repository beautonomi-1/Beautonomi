/**
 * True if JSON working_hours has at least one day marked open
 * (matches OperatingHoursEditor shape + legacy keys).
 */
export function locationHasOperatingHours(workingHours: unknown): boolean {
  if (!workingHours || typeof workingHours !== "object" || Array.isArray(workingHours)) {
    return false;
  }
  for (const day of Object.values(workingHours as Record<string, unknown>)) {
    if (!day || typeof day !== "object") continue;
    const d = day as Record<string, unknown>;
    if (d.closed === true) continue;
    if (d.closed === false) return true;
    if (d.is_open === true) return true;
    if (
      d.is_open !== false &&
      typeof d.open_time === "string" &&
      typeof d.close_time === "string" &&
      d.open_time.trim().length > 0 &&
      d.close_time.trim().length > 0
    ) {
      return true;
    }
    if (
      typeof d.open === "string" &&
      d.open.trim().length > 0 &&
      typeof d.close === "string" &&
      d.close.trim().length > 0
    ) {
      return true;
    }
  }
  return false;
}
