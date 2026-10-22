/**
 * Routes reachable while portal is `provider_onboarding` (draft / suspended).
 * Shared by ProviderPortalGate (client) and proxy.ts (edge) so behavior matches.
 */
export const PROVIDER_ONBOARDING_ROUTE_PREFIXES = [
  "/provider/get-started",
  "/provider/onboarding",
  "/provider/embed",
  "/provider/dashboard",
  "/provider/subscription-checkout",
  "/provider/subscription",
  "/provider/settings/appointment-activity/business-details",
  "/provider/settings/business-description",
  "/provider/settings/locations",
  "/provider/settings/gallery",
  "/provider/settings/operating-hours",
  "/provider/settings/sales/card-machines",
  "/provider/settings/sales/card-machines/yoco",
  "/provider/settings/sales/yoco-integration",
  "/provider/settings/sales/yoco-devices",
  "/provider/settings/sales/travel-fees",
  "/provider/settings/cancellation-policies",
  "/provider/settings/payments",
  "/provider/settings/payout-accounts",
  "/provider/catalogue/services",
  "/provider/account/personal-profile",
  "/provider/settings/verification",
] as const;

/** Exact match only — do not treat `/provider/settings/*` as allowed via prefix. */
export const PROVIDER_ONBOARDING_EXACT_ROUTES = ["/provider/settings"] as const;

export function isProviderOnboardingRouteAllowed(pathname: string): boolean {
  if ((PROVIDER_ONBOARDING_EXACT_ROUTES as readonly string[]).includes(pathname)) {
    return true;
  }
  return PROVIDER_ONBOARDING_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
