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

  const { data: balanceData, error: balanceError } = await supabase.rpc("get_user_loyalty_balance", {
    p_user_id: user.id,
  });

  if (!balanceError && balanceData != null) {
    const n = typeof balanceData === "number" ? balanceData : Number(balanceData);
    return successResponse({ balance: Number.isFinite(n) ? n : 0 });
  }

  return successResponse({ balance: 0 });
}
