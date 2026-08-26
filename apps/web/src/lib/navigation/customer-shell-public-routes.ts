/**
 * Routes where we render the page shell immediately (no full-tree block on auth / account-status).
 * Fixes iOS Safari / WebKit cases where a loading gate or overlay prevented taps from reaching content.
 * Admin stays gated separately via pathname check.
 */
const PREFIXES = [
  "/learn",
  "/help",
  "/login",
  "/signup",
  "/forgot-password",
  "/partner-profile",
  "/category",
  "/explore",
  "/gift-card",
  "/privacy-policy",
  "/terms-and-condition",
  "/age-suitability",
  "/customer/eula",
  "/accessibility",
  "/BCover-for-partners",
  "/beautonomi-friendly",
  "/career",
  "/resources",
  "/become-a-partner",
  "/search",
  "/bookings",
  "/inbox",
  "/shop",
  "/cart",
  "/checkout",
  "/book",
  "/profile",
  "/account-settings",
  "/orders",
  "/reactivate",
  "/account-suspended",
  "/locations",
  "/about",
  "/why-beautonomi",
  "/provider",
] as const;

export function isCustomerShellPublicRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.startsWith("/admin")) return false;
  if (pathname === "/") return true;
  return PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
