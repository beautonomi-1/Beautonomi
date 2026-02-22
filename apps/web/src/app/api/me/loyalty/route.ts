import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/loyalty
 * 
 * Get current user's loyalty points, balance, and milestones
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    // Get user's loyalty points balance using the function
    let pointsBalance = 0;
    let pointsHistory: any[] = [];

    try {
      // Use the get_user_loyalty_balance function
      const { data: balanceData, error: balanceError } = await supabase
        .rpc("get_user_loyalty_balance", { p_user_id: user.id });

      if (balanceError) {
        console.warn("Error calling get_user_loyalty_balance:", balanceError);
        // Fallback: calculate manually
        const { data: transactions } = await supabase
          .from("loyalty_point_transactions")
          .select("points, transaction_type, expires_at")
          .eq("user_id", user.id);
        
        if (transactions) {
          pointsBalance = transactions.reduce((sum, t) => {
            const isExpired = t.expires_at && new Date(t.expires_at) < new Date();
            if (isExpired) return sum;
            
            if (t.transaction_type === "earned" || t.transaction_type === "adjusted") {
              return sum + Number(t.points || 0);
            } else if (t.transaction_type === "redeemed" || t.transaction_type === "expired") {
              return sum - Number(t.points || 0);
            }
            return sum;
          }, 0);
          pointsBalance = Math.max(pointsBalance, 0);
        }
      } else if (balanceData !== null) {
        pointsBalance = Number(balanceData) || 0;
      }

      // Get points history/transactions
      const { data: history, error: historyError } = await supabase
        .from("loyalty_point_transactions")
        .select("id, points, transaction_type, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!historyError && history) {
        pointsHistory = history;
      }
    } catch {
      // Tables might not exist, use defaults
      console.warn("Loyalty points tables not found, using default balance");
    }

    // Get active loyalty rule to calculate redemption value
    let redemptionRate = 100; // Default: 100 points = 1 currency unit
    let currency = "ZAR";
    let pointsPerCurrency = 1;

    try {
      const { data: activeRule, error: ruleError } = await supabase
        .from("loyalty_rules")
        .select("points_per_currency_unit, currency, redemption_rate")
        .eq("is_active", true)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!ruleError && activeRule) {
        redemptionRate = Number(activeRule.redemption_rate) || 100;
        currency = activeRule.currency || "ZAR";
        pointsPerCurrency = Number(activeRule.points_per_currency_unit) || 1;
      }
    } catch {
      console.warn("loyalty_rules table not found, using defaults");
    }

    // Get available milestones
    let milestones: any[] = [];
    let nextMilestone: any = null;

    try {
      const { data: allMilestones, error: milestonesError } = await supabase
        .from("loyalty_milestones")
        .select("id, name, description, points_threshold, reward_type, reward_amount, reward_currency")
        .eq("is_active", true)
        .order("points_threshold", { ascending: true });

      if (!milestonesError && allMilestones) {
        milestones = allMilestones;
        // Find next milestone user hasn't reached
        nextMilestone = allMilestones.find((m) => m.points_threshold > pointsBalance) || null;
      }
    } catch {
      console.warn("loyalty_milestones table not found");
    }

    // Calculate redemption value
    const redemptionValue = pointsBalance / redemptionRate;

    return successResponse({
      points_balance: pointsBalance,
      redemption_value: redemptionValue,
      redemption_currency: currency,
      redemption_rate: redemptionRate,
      points_per_currency_unit: pointsPerCurrency,
      next_milestone: nextMilestone,
      available_milestones: milestones,
      history: pointsHistory,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty points");
  }
}
