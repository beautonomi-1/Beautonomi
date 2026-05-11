import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/me/loyalty
 *
 * Get current user's loyalty points, balance, and milestones (ledger-backed).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    let pointsBalance = 0;
    let pointsHistory: any[] = [];

    try {
      const { data: balanceData, error: balanceError } = await supabase
        .rpc("get_customer_available_points", { customer_uuid: user.id });

      if (balanceError) {
        console.warn("Error calling get_customer_available_points:", balanceError);
      } else if (balanceData !== null) {
        pointsBalance = Number(balanceData) || 0;
      }

      const { data: history, error: historyError } = await supabase
        .from("loyalty_points_ledger")
        .select("id, points_amount, transaction_type, description, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!historyError && history) {
        pointsHistory = history.map((row: any) => ({
          id: row.id,
          points: Number(row.points_amount) || 0,
          transaction_type: row.transaction_type,
          description: row.description || "",
          created_at: row.created_at,
        }));
      }
    } catch {
      console.warn("Loyalty ledger read failed, using default balance");
    }

    let redemptionRate = 100;
    let currency = lastResortCurrency;
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
        currency = activeRule.currency || lastResortCurrency;
        pointsPerCurrency = Number(activeRule.points_per_currency_unit) || 1;
      }
    } catch {
      console.warn("loyalty_rules table not found, using defaults");
    }

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
        nextMilestone = allMilestones.find((m) => m.points_threshold > pointsBalance) || null;
      }
    } catch {
      console.warn("loyalty_milestones table not found");
    }

    const redemptionValue = redemptionRate > 0 ? pointsBalance / redemptionRate : 0;

    const res = successResponse({
      points_balance: pointsBalance,
      redemption_value: redemptionValue,
      redemption_currency: currency,
      redemption_rate: redemptionRate,
      points_per_currency_unit: pointsPerCurrency,
      next_milestone: nextMilestone,
      available_milestones: milestones,
      history: pointsHistory,
    });
    res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    return res;
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty points");
  }
}
