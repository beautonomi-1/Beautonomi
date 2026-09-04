const DASHBOARD_LOCATION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ignore malformed `location_id` query values so they cannot 500 the dashboard. */
export function normalizeDashboardLocationId(locationId: string | null | undefined): string | null {
  if (typeof locationId !== "string") return null;
  const trimmed = locationId.trim();
  return DASHBOARD_LOCATION_ID.test(trimmed) ? trimmed : null;
}

/**
 * When a branch is selected, include bookings at that branch, at-home house calls
 * without a branch, and provider walk-in appointments that have no location_id.
 */
export function dashboardBookingLocationOrFilter(locationId: string): string {
  return [
    `location_id.eq.${locationId}`,
    `and(location_id.is.null,location_type.eq.at_home)`,
    `and(location_id.is.null,booking_source.eq.walk_in)`,
  ].join(",");
}

/**
 * Progressive PostgREST OR filters for dashboard booking queries.
 * The preferred filter uses `booking_source`; if that column/filter is rejected
 * (42703), callers retry the next candidate instead of failing the whole page.
 */
export function dashboardBookingLocationOrFilterFallbacks(locationId: string): string[] {
  return [
    dashboardBookingLocationOrFilter(locationId),
    [
      `location_id.eq.${locationId}`,
      `and(location_id.is.null,location_type.eq.at_home)`,
    ].join(","),
    `location_id.eq.${locationId}`,
  ];
}

/**
 * Location scope for `group_bookings` (has `location_id` / `location_type`, not `booking_source`).
 * Using {@link dashboardBookingLocationOrFilter} here fails with PostgREST 42703.
 */
export function dashboardGroupBookingLocationOrFilter(locationId: string): string {
  return [
    `location_id.eq.${locationId}`,
    `and(location_id.is.null,location_type.eq.at_home)`,
    // Legacy / provider-created groups may have null location_id with at_salon —
    // include them under any selected branch so they are never orphaned.
    `location_id.is.null`,
  ].join(",");
}

/** In-memory branch filter matching {@link dashboardGroupBookingLocationOrFilter}. */
export function groupMatchesDashboardLocation(
  locationId: string | null | undefined,
  group: { location_id?: string | null; location_type?: string | null },
): boolean {
  if (!locationId) return true;
  const loc = group.location_id ?? null;
  if (loc === locationId) return true;
  if (loc == null) return true;
  return false;
}

/** In-memory branch filter matching {@link dashboardBookingLocationOrFilter}. */
export function bookingMatchesDashboardLocation(
  locationId: string | null | undefined,
  booking: {
    location_id?: string | null;
    location_type?: string | null;
    booking_source?: string | null;
  },
): boolean {
  if (!locationId) return true;
  const loc = booking.location_id ?? null;
  if (loc === locationId) return true;
  if (loc == null && booking.location_type === "at_home") return true;
  if (loc == null && booking.booking_source === "walk_in") return true;
  return false;
}
