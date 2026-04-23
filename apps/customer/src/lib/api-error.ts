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
