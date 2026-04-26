/** Non-admin users may edit review content only within this window from the anchor timestamp. */
export const REVIEW_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const REVIEW_EDIT_WINDOW_MESSAGE =
  "Reviews can only be edited within 24 hours of posting. After that, only an administrator can change them—contact support if you need help.";

export function isSuperadminRole(role: string | null | undefined): boolean {
  return role === "superadmin";
}

/**
 * @param anchorIso - e.g. review `created_at` (customer review of provider) or `provider_response_at` (public reply).
 * @returns true when the actor must be blocked (window elapsed and not superadmin).
 */
export function isReviewContentEditBlocked(
  anchorIso: string | null | undefined,
  userRole: string | null | undefined,
): boolean {
  if (isSuperadminRole(userRole)) return false;
  if (!anchorIso) return false;
  const t = new Date(anchorIso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > REVIEW_EDIT_WINDOW_MS;
}
