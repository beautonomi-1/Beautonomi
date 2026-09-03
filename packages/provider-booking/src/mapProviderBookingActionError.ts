export const BOOKING_CHANGED_RELOAD = "This booking changed, reload";

export function mapProviderBookingActionError(
  error: string | null | undefined,
  code?: string | null,
): string {
  if (!error && !code) return "The booking could not be updated. Please refresh and try again.";
  const normalized = (error || "").trim().toLowerCase();
  if (normalized === "failed to update booking" || code === "INTERNAL_ERROR") {
    return "The booking could not be updated safely. Refresh the booking and try again; if it still fails, choose another slot or contact support.";
  }
  switch (code) {
    case "INVALID_STATUS_TRANSITION":
      return error || "That status change is not allowed from the booking's current state.";
    case "VERIFICATION_NOT_COMPLETE":
      return "Arrival must be verified by PIN or QR before starting this at-home service.";
    case "HOUSECALL_STAGE_REQUIRED":
      return error || "Complete the previous house-call step before starting service.";
    case "CONFLICT":
      return BOOKING_CHANGED_RELOAD;
    case "SLOT_NOT_AVAILABLE":
      return error || "That time is no longer available. Choose another slot.";
    case "VALIDATION_ERROR":
      return error || "Check the booking details and try again.";
    case "FORBIDDEN":
      return error || "You do not have permission to update this booking.";
    case "NOT_FOUND":
      return "This booking could not be found. Refresh your bookings list.";
    default:
      return error || "The booking could not be updated. Please refresh and try again.";
  }
}
