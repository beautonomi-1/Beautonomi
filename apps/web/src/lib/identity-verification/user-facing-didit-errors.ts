/**
 * Map Didit / session-create failures to provider- and customer-safe copy.
 *
 * Never surface Didit billing, credits, or raw API bodies to end users —
 * those are platform ops concerns (e.g. top-up at business.didit.me).
 */

export const DIDIT_SESSION_UNAVAILABLE_MESSAGE =
  "Online verification is temporarily unavailable. Please try again later or contact support.";

const MANUAL_UPLOAD_HINT =
  "You can upload your ID below for manual review.";

/** True when the message leaks Didit billing, credits, or raw API payloads. */
export function isDiditProviderLeakMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("enough credits") ||
    lower.includes("insufficient credit") ||
    lower.includes("out of credit") ||
    lower.includes("top up") ||
    lower.includes("business.didit.me") ||
    lower.includes("didit api") ||
    lower.includes("failed to create didit") ||
    lower.includes("failed to recover didit") ||
    /x-api-key|workflow_id|vendor_data/i.test(message)
  );
}

/**
 * Safe message for API responses when Didit session create/recover fails.
 * Callers should still log the raw error server-side.
 */
export function userFacingDiditSessionCreateMessage(_raw?: unknown): string {
  return DIDIT_SESSION_UNAVAILABLE_MESSAGE;
}

/**
 * Client-side defense: sanitize any launch/session error and optionally
 * mention manual upload only when that path is actually available.
 */
export function formatDiditLaunchError(
  raw: string | null | undefined,
  options?: { manualAvailable?: boolean },
): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  const base =
    !trimmed || isDiditProviderLeakMessage(trimmed)
      ? DIDIT_SESSION_UNAVAILABLE_MESSAGE
      : trimmed;

  if (options?.manualAvailable) {
    return `${base} ${MANUAL_UPLOAD_HINT}`;
  }
  return base;
}
