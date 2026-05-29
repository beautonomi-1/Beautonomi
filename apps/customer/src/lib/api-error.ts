/**
 * Consistent extraction of user-facing messages from API errors and thrown values.
 * Use for Alert.alert, setError(), and inline error text.
 */
/**
 * Get a short, user-facing message from an API error or caught exception.
 * Accepts unknown so catch (e) can be passed directly.
 * - ApiError (from api.get/post etc.): uses error.message
 * - Error: uses error.message
 * - string: returns as-is
 * - Otherwise: returns fallback
 */
function readBookingHoldSlotErrorCode(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const code = (details as { slot_error_code?: unknown }).slot_error_code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Differentiated copy for POST /api/public/booking-holds when the server
 * returns `details.slot_error_code` alongside the generic slot message.
 */
export function getBookingHoldSlotUnavailableMessage(
  error: unknown,
  fallback: string = "Something went wrong. Please try again.",
): string {
  const code = readBookingHoldSlotErrorCode(error);
  if (code === "NO_STAFF_AVAILABLE") {
    return "No staff member can take this slot right now. Try a different time or pick a specific staff.";
  }
  if (code === "CALENDAR_BLOCKED") {
    return "The provider just blocked this time. Please pick another slot.";
  }
  if (code === "SLOT_TAKEN_BY_HOLD") {
    return "Someone else just reserved this slot. Pick another time.";
  }
  if (code === "CONFLICT_SNAPSHOT") {
    return "This time was just booked. Please pick another slot.";
  }
  if (code === "OUTSIDE_WORKING_HOURS") {
    return "This time slot is outside the provider's working hours. Please go back and choose a different time.";
  }
  return getApiErrorMessage(error, fallback);
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  if (error == null) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  if (error instanceof Error) return error.message.trim() || fallback;
  const msg = (error as { message?: string }).message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return fallback;
}

/**
 * Read numeric HTTP status from API client error objects (`status` or `statusCode`).
 * Used for auth detection without `as any`.
 */
export function getHttpErrorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { status?: unknown; statusCode?: unknown };
  if (typeof o.status === "number" && Number.isFinite(o.status)) return o.status;
  if (typeof o.statusCode === "number" && Number.isFinite(o.statusCode)) return o.statusCode;
  return undefined;
}
