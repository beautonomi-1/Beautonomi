/**
 * Consistent extraction of user-facing messages from API errors and thrown values.
 * Accepts unknown so catch (e) can be passed directly.
 */
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
 * Used in session recovery so 401 detection works without narrowing gaps.
 */
export function getHttpErrorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { status?: unknown; statusCode?: unknown };
  if (typeof o.status === "number" && Number.isFinite(o.status)) return o.status;
  if (typeof o.statusCode === "number" && Number.isFinite(o.statusCode)) return o.statusCode;
  return undefined;
}

/** Api client sets `code` on synthetic errors (NETWORK_ERROR, TIMEOUT, etc.). */
export function getApiErrorCode(err: unknown): string | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const c = (err as { code?: unknown }).code;
  return typeof c === "string" && c.trim() ? c.trim() : undefined;
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
