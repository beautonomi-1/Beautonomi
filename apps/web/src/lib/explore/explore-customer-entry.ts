/**
 * Customer Explore entry surfaces (product contract):
 * - Mobile app: Explore is a hidden tab (no bottom-bar icon); primary entry is Home header → /(tabs)/explore.
 * - Web: /explore is in the main header (Home | Explore) and listed in customer shell public routes.
 */
export const EXPLORE_CUSTOMER_WEB_PATH = "/explore" as const;

export function isExploreCustomerPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === EXPLORE_CUSTOMER_WEB_PATH || pathname.startsWith(`${EXPLORE_CUSTOMER_WEB_PATH}/`);
}
