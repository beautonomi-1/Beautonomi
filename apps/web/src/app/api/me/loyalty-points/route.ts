import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, requireRoleInApi, getOffsetPaginationParams } from "@/lib/supabase/api-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/me/loyalty-points
 * Balance and history from canonical `loyalty_points_ledger` via
 * `get_customer_available_points` and `loyalty_points_balance` (view).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveTenantIdWithZaFallback(request);
    const tenantRegion = await getTenantRegionConfig(tenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { limit, offset } = getOffsetPaginationParams(request, { defaultLimit: 20, maxLimit: 100 });

    let available_balance = 0;
    let total_earned = 0;
    let total_redeemed = 0;
    let last_transaction_at: string | null = null;
    let redemption_rate = 100;
    let currency = lastResortCurrency;
    let min_redemption_points = 50;
    let recent_transactions: { id: string; type: string; points: number; description: string; created_at: string }[] = [];

    try {
      const { data: config } = await supabase
        .from("loyalty_point_config")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: balanceData } = await supabase
        .rpc("get_customer_available_points", { customer_uuid: user.id });

      available_balance = Number(balanceData) || 0;

      if (config) {
        redemption_rate = Number(config.redemption_rate) || 10;
        const parsedMinRedemption = Number(config.min_redemption_points);
        min_redemption_points = Number.isFinite(parsedMinRedemption) ? parsedMinRedemption : 50;
      } else {
        const { data: legacyRule } = await supabase
          .from("loyalty_rules")
          .select("redemption_rate, currency, min_redemption_points")
          .eq("is_active", true)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (legacyRule) {
          redemption_rate = Number(legacyRule.redemption_rate) || 100;
          currency = legacyRule.currency || lastResortCurrency;
          const parsedMin = Number(legacyRule.min_redemption_points);
          min_redemption_points = Number.isFinite(parsedMin) ? parsedMin : 50;
        }
      }

      const { data: balanceSummary } = await supabase
        .from("loyalty_points_balance")
        .select("*")
        .eq("customer_id", user.id)
        .maybeSingle();

      if (balanceSummary) {
        total_earned = Number(balanceSummary.total_earned) || 0;
        total_redeemed = Number(balanceSummary.total_redeemed) || 0;
        last_transaction_at = balanceSummary.last_transaction_at ?? null;
      }

      const { data: transactions, error: transactionsError } = await supabase
        .from("loyalty_points_ledger")
        .select("id, transaction_type, points_amount, description, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!transactionsError && transactions?.length) {
        recent_transactions = transactions.map((t: any) => {
          const raw = t.transaction_type;
          const pts = Number(t.points_amount) || 0;
          const type =
            raw === "expired" ? "expire" : pts < 0 ? "redeem" : "earn";
          return {
            id: t.id,
            type,
            points: pts,
            description: t.description || "",
            created_at: t.created_at,
          };
        });
      }
    } catch {
      // Keep defaults if ledger unavailable
    }

    let next_milestone: any = null;
    let available_milestones: any[] = [];

    try {
      const { data: allMilestones } = await supabase
        .from("loyalty_milestones")
        .select("id, name, description, points_threshold, reward_type, reward_amount, reward_currency")
        .eq("is_active", true)
        .order("points_threshold", { ascending: true });

      if (allMilestones?.length) {
        const lifetime = total_earned || available_balance;
        available_milestones = allMilestones.map((m: any) => ({
          ...m,
          points_required: m.points_threshold,
          reward_description: m.description,
        }));
        next_milestone = allMilestones.find((m: any) => (m.points_threshold || 0) > lifetime) ?? null;
        if (next_milestone) {
          next_milestone = {
            ...next_milestone,
            points_required: next_milestone.points_threshold,
            reward_description: next_milestone.description,
          };
        }
      }
    } catch {
      // ignore
    }

    const currencySymbol = currency === "ZAR" ? "R" : currency;
    const conversion_display = `${redemption_rate} points = ${currencySymbol}1 discount`;
    const can_redeem_currency = redemption_rate > 0 ? available_balance / redemption_rate : 0;

    return successResponse({
      points_balance: available_balance,
      balance: {
        available: available_balance,
        total_earned,
        total_redeemed,
        last_transaction_at,
      },
      redemption_rate,
      redemption_currency: currency,
      redemption_value: redemption_rate > 0 ? available_balance / redemption_rate : 0,
      conversion: {
        rate: redemption_rate,
        display: conversion_display,
        can_redeem_amount: can_redeem_currency,
        currency,
      },
      config: {
        min_redemption_points,
        max_redemption_percentage: 50,
        points_expiry_days: 365,
        earning_rate: 1.0,
      },
      minimum_redemption: min_redemption_points,
      recent_transactions: recent_transactions,
      lifetime_points: total_earned,
      earning_rate_description: "Earn points with every booking",
      next_milestone: next_milestone,
      available_milestones: available_milestones,
      milestones: available_milestones,
      pagination: {
        limit,
        offset,
        has_more: recent_transactions.length === limit,
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch loyalty points");
  }
}
