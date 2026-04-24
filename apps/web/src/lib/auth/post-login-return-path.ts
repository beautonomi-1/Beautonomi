import type { Portal } from "@/lib/auth/role";
import { getDefaultRouteForPortal } from "@/lib/auth/role";

/**
 * Customer-centric return URLs (saved as `next` / `redirect` during browsing).
 * Provider accounts should not land here after signing in from the provider portal
 * or when OAuth carries these as `next`.
 */
export function isCustomerSkewedPostLoginPath(pathname: string): boolean {
  if (pathname === "/bookings") return true;
  if (pathname === "/account-settings" || pathname.startsWith("/account-settings/")) return true;
  return false;
}

export function resolvePortalAwareReturnPathname(portal: Portal, requestedPathname: string): string {
  if (portal === "provider_onboarding") {
    const allowedSetupPath =
      requestedPathname === "/provider/onboarding" ||
      requestedPathname.startsWith("/provider/onboarding/") ||
      requestedPathname === "/provider/get-started" ||
      requestedPathname.startsWith("/provider/get-started/") ||
      requestedPathname.startsWith("/provider/embed");
    return allowedSetupPath ? requestedPathname : getDefaultRouteForPortal(portal);
  }
  if (portal === "provider") {
    if (isCustomerSkewedPostLoginPath(requestedPathname)) {
      return getDefaultRouteForPortal(portal);
    }
  }
  return requestedPathname;
}

/** Login flows often only know `public.users.role` (no provider_status); good enough for post-login routing. */
export function resolvePostLoginPathnameFromRole(role: string, requestedPathname: string): string {
  let portal: Portal | null = null;
  if (role === "provider_onboarding") portal = "provider_onboarding";
  else if (role === "provider_owner" || role === "provider_staff") portal = "provider";
  if (portal) return resolvePortalAwareReturnPathname(portal, requestedPathname);
  return requestedPathname;
}
