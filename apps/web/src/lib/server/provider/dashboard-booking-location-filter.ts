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
 * Location scope for `group_bookings` (has `location_id` / `location_type`, not `booking_source`).
 * Using {@link dashboardBookingLocationOrFilter} here fails with PostgREST 42703.
 */
export function dashboardGroupBookingLocationOrFilter(locationId: string): string {
  return [
    `location_id.eq.${locationId}`,
    `and(location_id.is.null,location_type.eq.at_home)`,
  ].join(",");
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
