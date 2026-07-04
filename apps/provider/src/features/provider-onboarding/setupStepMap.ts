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
  // Personal profile (freelancer bio) is closest to identity step.
  "personal-profile": 2,
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
  // §provider-onboarding-2026-05: `payment-methods` and `payout` are now
  // handled exclusively by their native screens (returned via the server's
  // `native_route` field). Intentionally omitted here so we never land
  // providers on a misleading wizard step (which previously mapped both to
  // unrelated screens 4/13) when their native route is unavailable; the
  // checklist UI now falls back to the onboarding wizard root instead.
  // Identity verification is post-onboarding admin flow; nearest wizard
  // surface is "Your identity" so the provider can confirm details first.
  "identity-verification": 2,
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
