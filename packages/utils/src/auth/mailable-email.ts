/** Domains used for synthetic / internal-only account emails (not mailable). */
export const NON_MAILABLE_EMAIL_DOMAINS = [
  "@beautonomi.local",
  "@beautonomi.invalid",
  "@phone.local",
] as const;

/**
 * True when the address is a synthetic placeholder (walk-in, phone-only signup, etc.)
 * and must not be shown in onboarding or used for outbound email.
 */
export function isNonMailableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) return false;
  return NON_MAILABLE_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}

/** True when the address looks like a real, user-supplied email. */
export function isMailableEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return false;
  return !isNonMailableEmail(trimmed);
}
