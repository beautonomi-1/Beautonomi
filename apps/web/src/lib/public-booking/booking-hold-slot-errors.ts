import { errorResponse } from "@/lib/supabase/api-helpers";

/** User-facing copy stays generic; `details.slot_error_code` disambiguates for clients. */
export const GENERIC_SLOT_UNAVAILABLE_MESSAGE =
  "This time slot is no longer available. Please select another time.";

export type BookingHoldSlotErrorCode =
  | "SLOT_TAKEN_BY_HOLD"
  | "NO_STAFF_AVAILABLE"
  | "CALENDAR_BLOCKED"
  | "CONFLICT_SNAPSHOT";

export function bookingHoldSlotUnavailableResponse(
  slotErrorCode: BookingHoldSlotErrorCode,
) {
  return errorResponse(GENERIC_SLOT_UNAVAILABLE_MESSAGE, "CONFLICT", 409, {
    slot_error_code: slotErrorCode,
  });
}
