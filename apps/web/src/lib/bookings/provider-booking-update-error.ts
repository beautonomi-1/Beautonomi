import { errorResponse } from "@/lib/supabase/api-helpers";

type PostgresUpdateError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export function logProviderBookingUpdateFailure(
  bookingId: string,
  updateError: PostgresUpdateError,
): void {
  console.error("[provider PATCH booking] update failed", {
    bookingId,
    code: updateError.code,
    message: updateError.message,
    details: updateError.details,
    hint: updateError.hint,
  });
}

/** Maps known Postgres constraint errors to a client-safe 409. */
export function providerBookingUpdateErrorResponse(
  bookingId: string,
  updateError: PostgresUpdateError,
) {
  logProviderBookingUpdateFailure(bookingId, updateError);
  if (updateError.code === "23514" || updateError.code === "23502") {
    return errorResponse(
      "This booking's amounts don't add up, so it can't be changed. Contact support.",
      "BOOKING_DATA_INVALID",
      409,
    );
  }
  return null;
}
