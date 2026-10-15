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

function readRetryAfterSeconds(error: unknown): number | null {
  if (error == null || typeof error !== "object") return null;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return null;
  const raw = (details as { retry_after_seconds?: unknown }).retry_after_seconds;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.ceil(raw);
  return null;
}

export function getBookingHoldFailureMessage(
  error: unknown,
  t?: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const code =
    error != null && typeof error === "object"
      ? ((error as { code?: string }).code ??
        (error as { error?: { code?: string } }).error?.code)
      : undefined;
  if (code === "RATE_LIMIT_EXCEEDED") {
    const retrySec = readRetryAfterSeconds(error);
    if (retrySec != null) {
      const minutes = Math.max(1, Math.ceil(retrySec / 60));
      return (
        t?.("checkout.holdRateLimitWait", { minutes }) ??
        `Too many attempts. Try again in ${minutes} min.`
      );
    }
    const serverMsg =
      error != null && typeof error === "object" && typeof (error as { message?: string }).message === "string"
        ? (error as { message: string }).message.trim()
        : "";
    if (serverMsg) return serverMsg;
  }
  if (error == null || typeof error !== "object") return DEFAULT_HOLD_FAILURE_MESSAGE;
  const { details, status, message } = error as {
    details?: { slot_error_code?: unknown };
    status?: unknown;
    message?: unknown;
  };
  const slotCode = details && typeof details === "object" ? details.slot_error_code : undefined;
  if (typeof slotCode === "string" && SLOT_ERROR_MESSAGES[slotCode]) return SLOT_ERROR_MESSAGES[slotCode];
  if (status === 409 && typeof message === "string" && message.trim()) return message.trim();
  return DEFAULT_HOLD_FAILURE_MESSAGE;
}
