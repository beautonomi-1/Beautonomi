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

/** Api client sets `code` on synthetic errors (NETWORK_ERROR, TIMEOUT, CANCELLED, etc.). */
export function getApiErrorCode(err: unknown): string | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { code?: unknown; error?: { code?: unknown } };
  const direct = o.code;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = o.error?.code;
  return typeof nested === "string" && nested.trim() ? nested.trim() : undefined;
}

/** User-facing copy when social features are restricted by age or safety settings. */
export function getSocialRestrictedMessage(
  error: unknown,
  t?: (key: string) => string,
): string | null {
  const code = getApiErrorCode(error);
  if (code === "SOCIAL_RESTRICTED") {
    return t?.("customer.safety.socialRestricted.body")
      ?? "This action isn't available with your current age or safety settings. You can review options in Content & safety controls.";
  }
  if (code === "SAFETY_SETTING_LOCKED") {
    return t?.("customer.safety.socialRestricted.lockedBody")
      ?? "This setting is managed for your age group and can't be changed here.";
  }
  return null;
}

export function getApiErrorMessageWithSafety(
  error: unknown,
  fallback: string = "Something went wrong. Please try again.",
  t?: (key: string) => string,
): string {
  return getSocialRestrictedMessage(error, t) ?? getApiErrorMessage(error, fallback);
}

/**
 * True when failure is likely transient (offline, DNS blip, server 5xx) or a
 * deliberate background abort (CANCELLED) — i.e. the caller should stay silent
 * and retry rather than surface a hard error. Not for 401/403 — callers handle
 * auth separately.
 */
export function isTransientApiFailure(err: unknown): boolean {
  const status = getHttpErrorStatus(err);
  const code = getApiErrorCode(err);
  if (code === "MISSING_API_BASE_URL") return false;
  if (code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "CANCELLED") return true;
  // Vercel Bot Protection / WAF can return HTML 429 pages; retry briefly like other transients.
  if (code === "HTML_ERROR" || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  const msg = getApiErrorMessage(err, "").toLowerCase();
  if (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timed out") ||
    msg.includes("check your internet connection")
  ) {
    return true;
  }
  return false;
}
