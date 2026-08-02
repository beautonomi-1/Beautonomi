export type BookingCreateErrorCode =
  | "SLOT_CONFLICT"
  | "CALENDAR_BLOCK"
  | "RESOURCE_CONFLICT"
  | "SLOT_NOT_AVAILABLE"
  | "CONFLICT"
  | "SUBSCRIPTION_REQUIRED"
  | "BOOKING_LIMIT_REACHED"
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "INSUFFICIENT_STOCK";

export function mapBookingCreateError(
  error: string | null | undefined,
  code?: string | null,
): { message: string; returnToTimePicker: boolean } {
  const c = (code ?? "").trim();
  switch (c) {
    case "SLOT_CONFLICT":
    case "CALENDAR_BLOCK":
    case "RESOURCE_CONFLICT":
    case "SLOT_NOT_AVAILABLE":
    case "CONFLICT":
      return {
        message: error || "That time is no longer available. Choose another slot.",
        returnToTimePicker: true,
      };
    case "SUBSCRIPTION_REQUIRED":
    case "BOOKING_LIMIT_REACHED":
      return {
        message: error || "Upgrade your subscription to create more bookings.",
        returnToTimePicker: false,
      };
    case "INSUFFICIENT_STOCK":
      return {
        message: error || "One or more products are out of stock.",
        returnToTimePicker: false,
      };
    case "VALIDATION_ERROR":
      return {
        message: error || "Check the booking details and try again.",
        returnToTimePicker: false,
      };
    case "FORBIDDEN":
      return {
        message: error || "You do not have permission to create this booking.",
        returnToTimePicker: false,
      };
    default:
      return {
        message: error || "Could not create the booking. Please try again.",
        returnToTimePicker: false,
      };
  }
}
