import { getSupabaseServer } from "@/lib/supabase/server";
import { errorResponse, successResponse } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/loyalty/balance
 * Lightweight balance for booking checkout (promotions step). Full history: GET /api/me/loyalty.
 */
export async function GET() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("Authentication required", "UNAUTHORIZED", 401);
  }

  const [balanceResult, configResult] = await Promise.all([
    supabase.rpc("get_user_loyalty_balance", { p_user_id: user.id }),
    supabase
      .from("loyalty_point_config")
      .select("redemption_rate")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const balance =
    !balanceResult.error && balanceResult.data != null
      ? (() => { const n = Number(balanceResult.data); return Number.isFinite(n) ? n : 0; })()
      : 0;
  const redemptionRate = Number(configResult.data?.redemption_rate) || 10;

  return successResponse({ balance, redemption_rate: redemptionRate });
}
