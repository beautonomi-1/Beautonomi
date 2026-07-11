/**
 * §provider-setup-seamless-ux 2026-05: Maps a `/api/provider/setup-status`
 * step id to the closest wizard step number defined in {@link STEPS}.
 *
 * Used when the dashboard or "More" completion card deep-links into the
 * onboarding wizard with `?focus=<step-id>` so the provider lands on the
 * exact step that addresses the missing field instead of restarting the
 * 13/14-step flow from the beginning.
 *
 * Keep this in sync with the server-canonical `NATIVE_ROUTE_BY_ID` in
 * `apps/web/src/app/api/provider/setup-status/route.ts` — when adding a new
 * setup-status id, add its wizard mapping here too.
 */
export const SETUP_STATUS_ID_TO_WIZARD_STEP: Record<string, number> = {
  // Business identity → wizard "Business details"
  "profile-details": 3,
  // Address / service area → wizard "Location"
  "service-address": 7,
  // Profile photo + gallery → wizard "Photos"
  "profile-photo": 8,
  gallery: 8,
  // Travel fees → wizard "Travel fees"
  "travel-fees": 10,
  // Catalogue → wizard "Services"
  services: 12,
  // Operating hours → wizard "Hours"
  availability: 13,
  // Card machine / payment terminal → wizard "Payment setup"
  payment: 4,
  // `personal-profile`, `identity-verification`, `payment-methods`, and
  // `payout` have dedicated native screens — intentionally omitted so
  // resolveSetupStepRoute falls back to the setup hub instead of wizard
  // step 2 (phone/email OTP).
};

/**
 * Resolve a setup-status step id to a wizard step number, falling back to
 * `null` when the id is unknown so callers can decide whether to land on a
 * default step (typically 1 — Team size).
 */
export function wizardStepForSetupStatusId(
  setupStatusId: string | null | undefined,
): number | null {
  if (!setupStatusId) return null;
  return SETUP_STATUS_ID_TO_WIZARD_STEP[setupStatusId] ?? null;
}
