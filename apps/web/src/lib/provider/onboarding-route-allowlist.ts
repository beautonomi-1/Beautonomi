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
  "/provider/settings/locations",
  "/provider/settings/gallery",
  "/provider/settings/operating-hours",
  "/provider/settings/sales/yoco-integration",
  "/provider/settings/sales/yoco-devices",
  "/provider/settings/payments",
  "/provider/settings/payout-accounts",
  "/provider/catalogue/services",
  "/provider/account/personal-profile",
  "/provider/settings/verification",
] as const;

export function isProviderOnboardingRouteAllowed(pathname: string): boolean {
  return PROVIDER_ONBOARDING_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
