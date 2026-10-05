/**
 * Client-safe copy for POST /api/public/booking-holds failures.
 * Mirrors `getBookingHoldSlotUnavailableMessage` in the customer app so both
 * surfaces explain *why* a slot could not be reserved.
 */
const SLOT_ERROR_MESSAGES: Record<string, string> = {
  NO_STAFF_AVAILABLE:
    "No staff member can take this slot right now. Try a different time or pick a specific staff.",
  CALENDAR_BLOCKED: "The provider just blocked this time. Please pick another slot.",
  SLOT_TAKEN_BY_HOLD: "Someone else just reserved this slot. Pick another time.",
  CONFLICT_SNAPSHOT: "This time was just booked. Please pick another slot.",
  OUTSIDE_WORKING_HOURS:
    "This time slot is outside the provider's working hours. Please choose a different time.",
};

export const DEFAULT_HOLD_FAILURE_MESSAGE =
  "Could not reserve your time slot. Please choose another available time.";

export function getBookingHoldFailureMessage(error: unknown): string {
  if (error == null || typeof error !== "object") return DEFAULT_HOLD_FAILURE_MESSAGE;
  const { details, status, message } = error as {
    details?: { slot_error_code?: unknown };
    status?: unknown;
    message?: unknown;
  };
  const code = details && typeof details === "object" ? details.slot_error_code : undefined;
  if (typeof code === "string" && SLOT_ERROR_MESSAGES[code]) return SLOT_ERROR_MESSAGES[code];
  if (status === 409 && typeof message === "string" && message.trim()) return message.trim();
  return DEFAULT_HOLD_FAILURE_MESSAGE;
}
