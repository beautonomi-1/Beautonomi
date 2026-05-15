/**
 * Maps a provider booking PATCH-shaped body to fields persisted on `group_bookings`.
 *
 * Group retail add-ons live in `group_bookings.products` (JSONB); totals are recomputed
 * server-side in PATCH /api/provider/group-bookings/[id] via `validateAndPriceGroupPackage`
 * and `groupPackageTotal` — not on `booking_products`.
 */
export function pickGroupBookingPatchPayload(updateData: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const passthrough = [
    "products",
    "scheduled_at",
    "scheduled_date",
    "scheduled_time",
    "allow_override",
    "service_id",
    "staff_id",
    "location_id",
    "max_participants",
    "duration_minutes",
    "status",
    "location_type",
    "travel_fee",
    "package_id",
    "title",
    "address_line1",
    "address_city",
    "address_state",
    "address_country",
    "address_postal_code",
    "address_latitude",
    "address_longitude",
    "address_place_name",
  ] as const;
  for (const k of passthrough) {
    if (updateData[k] !== undefined) out[k] = updateData[k];
  }
  if (updateData.team_member_id != null && out.staff_id === undefined) {
    out.staff_id = updateData.team_member_id;
  }
  if (updateData.special_requests !== undefined) {
    out.notes = updateData.special_requests;
  }
  if (updateData.notes !== undefined) {
    out.notes = updateData.notes;
  }
  return out;
}
