/** Normalize a phone for equality so formatting-only edits do not drop verification. */
export function normalizePhoneForCompare(value: string | null | undefined): string {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

/**
 * F3-18: changing `users.phone` via PATCH /api/me/profile must clear
 * `phone_verified` so the number cannot stay marked verified after a swap.
 * Returns the columns to merge into the users update, or null when phone is
 * not being written.
 */
export function phoneVerifiedResetPatch(
  currentPhone: string | null | undefined,
  nextPhone: string | null | undefined,
): Record<string, unknown> | null {
  if (nextPhone === undefined) return null;
  const next = nextPhone == null || String(nextPhone).trim() === "" ? null : String(nextPhone).trim();
  const same =
    normalizePhoneForCompare(currentPhone) === normalizePhoneForCompare(next);
  if (same) return { phone: next };
  return {
    phone: next,
    phone_verified: false,
    phone_verified_at: null,
  };
}
