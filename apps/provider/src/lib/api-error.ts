/**
 * Consistent extraction of user-facing messages from API errors and thrown values.
 * Accepts unknown so catch (e) can be passed directly.
 */
const FRIENDLY_BY_CODE: Record<string, string> = {
  FORBIDDEN: "You do not have permission to do this.",
  INVALID_STATUS: "This request is not allowed in its current status.",
  INVALID_AMOUNT: "Enter a valid amount and try again.",
  INSUFFICIENT_BALANCE: "There is not enough balance for this request.",
  PAYOUT_HELD: "Payouts are temporarily on hold. Contact support if you need help.",
  OVER_REFUND: "Refund exceeds the amount collected.",
  LEDGER_POSTING_FAILED: "The payment could not be recorded. Please retry.",
  PERIOD_LOCKED: "This financial period is locked.",
  NOT_SUPPORTED: "This action is not available.",
  VALIDATION_ERROR: "Check the details and try again.",
  IDEMPOTENCY_KEY_CONFLICT: "This request was already processed.",
};

function looksLikeRawSql(message: string): boolean {
  return /finance ledger posting failed|violates check constraint|SQLSTATE|P0001|new_total_refunded|Refund amount validation failed/i.test(
    message,
  );
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  if (error == null) return fallback;
  const code = getApiErrorCode(error);
  const friendly = code ? FRIENDLY_BY_CODE[code] : undefined;
  if (typeof error === "string") {
    const trimmedString = error.trim();
    if (!trimmedString || looksLikeRawSql(trimmedString)) return friendly || fallback;
    return trimmedString;
  }
  const msg =
    error instanceof Error
      ? error.message
      : (error as { message?: string }).message;
  const trimmed = typeof msg === "string" ? msg.trim() : "";
  if (!trimmed || looksLikeRawSql(trimmed)) return friendly || fallback;
  return trimmed;
}

/**
 * Read numeric HTTP status from API client error objects (`status` or `statusCode`).
 * Used in session recovery so 401 detection works without narrowing gaps.
 */
export function getHttpErrorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { status?: unknown; statusCode?: unknown; status_code?: unknown; error?: { status?: unknown; statusCode?: unknown; status_code?: unknown } };
  if (typeof o.status === "number" && Number.isFinite(o.status)) return o.status;
  if (typeof o.statusCode === "number" && Number.isFinite(o.statusCode)) return o.statusCode;
  if (typeof o.status_code === "number" && Number.isFinite(o.status_code)) return o.status_code;
  const nested = o.error;
  if (nested) {
    if (typeof nested.status === "number" && Number.isFinite(nested.status)) return nested.status;
    if (typeof nested.statusCode === "number" && Number.isFinite(nested.statusCode)) return nested.statusCode;
    if (typeof nested.status_code === "number" && Number.isFinite(nested.status_code)) return nested.status_code;
  }
  return undefined;
}

/** Api client sets `code` on synthetic errors (NETWORK_ERROR, TIMEOUT, etc.). */
export function getApiErrorCode(err: unknown): string | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { code?: unknown; error?: { code?: unknown } };
  const direct = o.code;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = o.error?.code;
  return typeof nested === "string" && nested.trim() ? nested.trim() : undefined;
}

/**
 * True when failure is likely transient (offline, DNS blip, server 5xx).
 * Not for 401/403 — caller handles auth separately.
 */
export function isTransientApiFailure(err: unknown): boolean {
  const status = getHttpErrorStatus(err);
  const code = getApiErrorCode(err);
  if (code === "MISSING_API_BASE_URL") return false;
  // CANCELLED = deliberate background abort of an idempotent read; treat as
  // transient so callers stay silent and refetch on resume.
  if (code === "NETWORK_ERROR" || code === "TIMEOUT" || code === "CANCELLED") return true;
  // Rate limits are actionable, not transient noise (caller may show a specific UI).
  if (code === "RATE_LIMIT_EXCEEDED") return false;
  // Vercel Bot Protection / WAF can return HTML 429 pages; retry briefly like other transients.
  if (code === "HTML_ERROR" || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  const msg = getApiErrorMessage(err, "").toLowerCase();
  if (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("gateway timeout") ||
    msg.includes("check your internet connection")
  ) {
    return true;
  }
  return false;
}
