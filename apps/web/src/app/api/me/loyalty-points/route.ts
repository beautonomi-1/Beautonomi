import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { handleApiError, successResponse, requireRoleInApi } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/loyalty-points
 * Get current user's loyalty points balance and transaction history.
 * Uses ledger (loyalty_points_ledger) when available; falls back to legacy
 * (loyalty_point_transactions + get_user_loyalty_balance) so balance is always correct.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let available_balance = 0;
    let total_earned = 0;
    let total_redeemed = 0;
    let last_transaction_at: string | null = null;
    let redemption_rate = 100;
    let currency = "ZAR";
    let min_redemption_points = 50;
    let recent_transactions: { id: string; type: string; points: number; description: string; created_at: string }[] = [];

    // Try ledger path first (loyalty_points_ledger + config)
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
      redemption_rate = Number(config?.redemption_rate) || 10;
      min_redemption_points = Number(config?.min_redemption_points) ?? 50;

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
          const type = raw === "earned" || raw === "adjusted" || raw === "bonus" ? "earn" : raw === "redeemed" ? "redeem" : "expire";
          return {
            id: t.id,
            type,
            points: Number(t.points_amount) || 0,
            description: t.description || "",
            created_at: t.created_at,
          };
        });
      }
    } catch {
      // Ledger/config not available or error; fall through to legacy
    }

    let next_milestone: any = null;
    let available_milestones: any[] = [];

    // Fallback to legacy (loyalty_point_transactions) when ledger balance is 0 or ledger failed
    if (available_balance === 0 && recent_transactions.length === 0) {
      try {
        const { data: legacyBalance } = await supabase.rpc("get_user_loyalty_balance", { p_user_id: user.id });
        available_balance = Number(legacyBalance) || 0;

        const { data: activeRule } = await supabase
          .from("loyalty_rules")
          .select("redemption_rate, currency")
          .eq("is_active", true)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (activeRule) {
          redemption_rate = Number(activeRule.redemption_rate) || 100;
          currency = activeRule.currency || "ZAR";
        }

        const { data: history } = await supabase
          .from("loyalty_point_transactions")
          .select("id, points, transaction_type, description, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (history?.length) {
          total_earned = history
            .filter((t: any) => t.transaction_type === "earned" || t.transaction_type === "adjusted")
            .reduce((s: number, t: any) => s + Number(t.points || 0), 0);
          total_redeemed = history
            .filter((t: any) => t.transaction_type === "redeemed")
            .reduce((s: number, t: any) => s + Number(t.points || 0), 0);
          recent_transactions = history.map((t: any) => {
            const raw = t.transaction_type;
            const type = raw === "earned" || raw === "adjusted" ? "earn" : raw === "redeemed" ? "redeem" : "expire";
            return {
              id: t.id,
              type,
              points: Number(t.points) || 0,
              description: t.description || "",
              created_at: t.created_at,
            };
          });
        }

        const { data: allMilestones } = await supabase
          .from("loyalty_milestones")
          .select("id, name, description, points_threshold, reward_type, reward_amount, reward_currency")
          .eq("is_active", true)
          .order("points_threshold", { ascending: true });

        if (allMilestones?.length) {
          available_milestones = allMilestones.map((m: any) => ({
            ...m,
            points_required: m.points_threshold,
            reward_description: m.description,
          }));
          next_milestone = allMilestones.find((m: any) => (m.points_threshold || 0) > total_earned) ?? null;
          if (next_milestone) {
            next_milestone = { ...next_milestone, points_required: next_milestone.points_threshold, reward_description: next_milestone.description };
          }
        }
      } catch {
        // Legacy also failed; keep zeros and defaults
      }
    }

    // Load milestones for ledger path when not yet set
    if (available_milestones.length === 0) {
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
            next_milestone = { ...next_milestone, points_required: next_milestone.points_threshold, reward_description: next_milestone.description };
          }
        }
      } catch {
        // ignore
      }
    }

    const conversion_display = `${redemption_rate} points = R1 discount`;
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
      history: recent_transactions,
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
