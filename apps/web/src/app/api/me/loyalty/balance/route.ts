import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { errorResponse, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/loyalty/balance
 *
 * Lightweight balance for booking checkout (promotions step). Full history:
 * GET /api/me/loyalty.
 *
 * §Release-audit 2026-04: read both the ledger source and the legacy points
 * store while the migration is in progress, so the booking checkout matches
 * the loyalty points page and the redemption validator.
 *
 * §Customer-audit 2026-04 (round 2): previously this handler ignored the
 * incoming request, so mobile clients sending Bearer tokens were treated as
 * unauthenticated and the booking-flow loyalty panel silently showed 0
 * balance. Passing `request` enables Bearer-token auth via
 * `getSupabaseServer`.
 */
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const [ledgerResult, legacyResult, configResult] = await Promise.all([
    supabase.rpc("get_customer_available_points", { customer_uuid: user.id }),
    supabase.rpc("get_user_loyalty_balance", { p_user_id: user.id }),
    supabase
      .from("loyalty_point_config")
      .select("redemption_rate, min_redemption_points, max_redemption_percentage")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const toFiniteNumber = (val: unknown): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const ledgerBalance = !ledgerResult.error
    ? toFiniteNumber(ledgerResult.data)
    : NaN;
  const legacyBalance = !legacyResult.error
    ? toFiniteNumber(legacyResult.data)
    : 0;

  // Keep checkout aligned with the loyalty page during the ledger migration:
  // some customers still have valid points only in the legacy transaction store.
  const balance = Math.max(Number.isFinite(ledgerBalance) ? ledgerBalance : 0, legacyBalance);

  const cfg = configResult.data;
  const redemptionRate = Number(cfg?.redemption_rate) || 10;
  const minRedemptionPoints = Number(cfg?.min_redemption_points) || 0;
  const maxRedemptionPercentage = Number(cfg?.max_redemption_percentage) ?? 100;

  return successResponse({
    balance,
    redemption_rate: redemptionRate,
    min_redemption_points: minRedemptionPoints,
    max_redemption_percentage: maxRedemptionPercentage,
  });
}
