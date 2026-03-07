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
