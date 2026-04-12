/**
 * Map portal/UI strings and legacy values to PostgreSQL `public.booking_status` enum literals.
 * Used by web API routes and any client that might echo provider `default_appointment_status`
 * into `create_booking_with_locking` payloads — **not** a substitute for server validation.
 *
 * @see supabase/migrations/001_initial_schema.sql — base enum
 * @see supabase/migrations/275_bookings_checked_in_waiting_room.sql — waiting, checked_in
 */
const BOOKING_STATUS_ENUM_VALUES = new Set<string>([
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "waiting",
  "checked_in",
]);

/** Provider portal labels that are not valid enum literals. */
const PORTAL_ALIAS_TO_DB: Record<string, string> = {
  booked: "confirmed",
  started: "in_progress",
};

/**
 * Normalize to a valid `booking_status` for RPC payloads (`(p_booking_data->>'status')::booking_status`).
 * Unknown values (e.g. `"failed"`, payment-status leaks) map to `"pending"`.
 */
export function mapToBookingStatusEnum(input: string | undefined | null): string {
  if (input == null || typeof input !== "string") {
    return "pending";
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return "pending";
  }
  const lower = trimmed.toLowerCase();
  if (BOOKING_STATUS_ENUM_VALUES.has(lower)) {
    return lower;
  }
  const mapped = PORTAL_ALIAS_TO_DB[lower];
  if (mapped) {
    return mapped;
  }
  return "pending";
}
