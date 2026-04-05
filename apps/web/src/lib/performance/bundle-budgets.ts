/**
 * Bundle size budgets for provider portal routes.
 *
 * These thresholds are used by the CI performance check to flag regressions.
 * Sizes are for the route-specific JS chunk (gzipped, in KB).
 *
 * To check current sizes locally:
 *   ANALYZE=true pnpm --filter web build
 *
 * Adjust budgets after intentional feature additions.
 */

export const ROUTE_BUNDLE_BUDGETS: Record<string, number> = {
  "/provider/dashboard": 120,
  "/provider/calendar": 180,
  "/provider/bookings": 100,
  "/provider/clients": 140,
  "/provider/catalogue": 80,
  "/provider/team": 80,
  "/provider/settings": 60,
  "/provider/reports": 60,
  "/provider/finance": 60,
  "/provider/analytics": 60,
  "/provider/ecommerce": 60,
};

/**
 * Maximum time budgets (ms) for critical routes.
 * Measured from component mount to data-ready state.
 */
export const ROUTE_TIMING_BUDGETS: Record<string, number> = {
  "/provider/dashboard": 2000,
  "/provider/calendar": 3000,
  "/provider/bookings": 2000,
  "/provider/clients": 2000,
  "/provider/catalogue": 2000,
  "/provider/team": 2000,
  "/provider/settings": 1500,
  "/provider/reports": 2500,
  "/provider/finance": 2000,
  "/provider/analytics": 3000,
};

export function checkBudget(
  route: string,
  actualMs: number,
): { ok: boolean; budgetMs: number; overBy: number } {
  const budgetMs = ROUTE_TIMING_BUDGETS[route] ?? 3000;
  return {
    ok: actualMs <= budgetMs,
    budgetMs,
    overBy: Math.max(0, actualMs - budgetMs),
  };
}
