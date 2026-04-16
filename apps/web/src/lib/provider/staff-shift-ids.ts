/**
 * GET /api/provider/shifts merges real `staff_shifts` rows with synthetic rows from
 * weekly `staff_schedules` and location hours. Only UUID ids from `staff_shifts` can be
 * PATCHed or DELETEd; synthetic ids are stable string prefixes for display.
 */
export function isSyntheticProviderShiftId(id: string | null | undefined): boolean {
  if (!id || typeof id !== "string") return false;
  return id.startsWith("schedule-") || id.startsWith("location-");
}
