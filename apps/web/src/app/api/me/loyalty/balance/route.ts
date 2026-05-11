import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { errorResponse, successResponse } from "@/lib/supabase/api-helpers";

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

  const [ledgerResult, configResult] = await Promise.all([
    supabase.rpc("get_customer_available_points", { customer_uuid: user.id }),
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

  const balance = !ledgerResult.error ? toFiniteNumber(ledgerResult.data) : 0;

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
