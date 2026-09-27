import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse } from "@/lib/supabase/api-helpers";
import { resolveLoyaltyConfig } from "@/lib/loyalty/resolve-loyalty-config";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/me/loyalty/balance
 *
 * Lightweight balance for booking checkout (promotions step). Full history:
 * GET /api/me/loyalty.
 *
 * Ledger-only: `get_customer_available_points` over `loyalty_points_ledger`.
 */
export async function GET(request: NextRequest) {
  const supabase = await getSupabaseServer(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const admin = getSupabaseAdmin();
  const [ledgerResult, cfg] = await Promise.all([
    supabase.rpc("get_customer_available_points", { customer_uuid: user.id }),
    resolveLoyaltyConfig(admin, LAST_RESORT_CURRENCY),
  ]);

  const toFiniteNumber = (val: unknown): number => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const balance = !ledgerResult.error ? toFiniteNumber(ledgerResult.data) : 0;

  return successResponse({
    balance,
    redemption_rate: cfg.redemptionRate,
    min_redemption_points: cfg.minRedemptionPoints,
    max_redemption_percentage: cfg.maxRedemptionPercentage,
  });
}
