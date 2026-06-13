/** Domains used for synthetic walk-in / shadow customer emails. */
export const SHADOW_EMAIL_DOMAINS = ["@beautonomi.invalid", "@beautonomi.local"] as const;

export function createWalkInEmail(): string {
  const uuid =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `walkin+${uuid}@beautonomi.invalid`;
}

export function isShadowEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return SHADOW_EMAIL_DOMAINS.some((domain) => lower.endsWith(domain));
}

export function isRealCustomerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return false;
  return !isShadowEmail(trimmed);
}
