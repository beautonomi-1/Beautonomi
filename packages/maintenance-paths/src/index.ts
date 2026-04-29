/**
 * Shared pathname prefixes for web maintenance gates (Next admin + Vite admin parity).
 */

/** Paths that stay reachable when `public_site` maintenance is enabled (partner funnel + auth). */
export const PUBLIC_SITE_MAINTENANCE_EXEMPT_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/become-a-partner",
  "/BCover-for-partners",
  "/partner-owner-page",
  "/pricing",
  "/why-beautonomi",
] as const;

/** Under `/provider`, funnel paths when `provider_web` maintenance allows partner funnel (default). */
export const PROVIDER_WEB_MAINTENANCE_EXEMPT_PREFIXES = [
  "/provider/onboarding",
  "/provider/embed",
  "/provider/subscription-checkout",
  "/provider/settings/ads/payment-return",
  "/provider/get-started",
] as const;
