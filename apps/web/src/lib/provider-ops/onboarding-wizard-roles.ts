/** Roles that may appear in the self-serve provider onboarding wizard before final submit. */
export const ONBOARDING_WIZARD_USER_ROLES = new Set([
  "provider_owner",
  "provider_onboarding",
  "customer",
]);

export function isOnboardingWizardUserRole(role: string | null | undefined): boolean {
  return !!role && ONBOARDING_WIZARD_USER_ROLES.has(role);
}

/** Draft address objects use `line1` in self-serve onboarding; legacy drafts may use `address_line1`. */
export function draftHasAddressLine(
  address: Record<string, unknown> | null | undefined
): boolean {
  if (!address) return false;
  const line1 = address.line1 ?? address.address_line1;
  return typeof line1 === "string" && line1.trim().length > 0;
}
