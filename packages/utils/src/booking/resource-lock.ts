const RESOURCE_LOCKED_STATUSES = new Set(["completed", "cancelled", "no_show"]);

/** When true, booking room/resource assignments cannot be changed (POST/DELETE return 409). */
export function isBookingResourceLocked(status: string | null | undefined): boolean {
  const raw = String(status ?? "").trim().toLowerCase();
  return RESOURCE_LOCKED_STATUSES.has(raw);
}