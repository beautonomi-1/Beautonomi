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
