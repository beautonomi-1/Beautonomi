/**
 * Map Didit / session-create failures to provider-safe copy.
 * Mirrors apps/web identity-verification user-facing sanitizer.
 */

export const DIDIT_SESSION_UNAVAILABLE_MESSAGE =
  "Online verification is temporarily unavailable. Please try again later or contact support.";

const MANUAL_UPLOAD_HINT =
  "You can upload your ID below for manual review.";

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
