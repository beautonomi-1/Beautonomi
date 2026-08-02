/** Stable API error codes for provider booking flows (web + mobile). */
export const BOOKING_ERROR_CODES = {
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  VERIFICATION_NOT_COMPLETE: "VERIFICATION_NOT_COMPLETE",
  HOUSECALL_STAGE_REQUIRED: "HOUSECALL_STAGE_REQUIRED",
  CONFLICT: "CONFLICT",
  SLOT_NOT_AVAILABLE: "SLOT_NOT_AVAILABLE",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[keyof typeof BOOKING_ERROR_CODES];

export function isBookingErrorCode(value: string | null | undefined): value is BookingErrorCode {
  if (!value) return false;
  return Object.values(BOOKING_ERROR_CODES).includes(value as BookingErrorCode);
}
