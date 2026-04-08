import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError, forbiddenResponse } from "@/lib/supabase/api-helpers";
import { requireSuperadminPlatform } from "@/lib/admin/require-superadmin-platform";

/**
 * GET /api/admin/ads/overview
 * Superadmin-only. Platform-wide ads KPIs for the command center.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperadminPlatform(request);
    if (!auth.user) return forbiddenResponse("Superadmin only");

    const admin = getSupabaseAdmin();
    const now = Date.now();
    const since7 = new Date(now - 7 * 86400000).toISOString();
    const since30 = new Date(now - 30 * 86400000).toISOString();

    const { data: campaignRows, error: cErr } = await admin.from("ads_campaigns").select("status");
    if (cErr) throw cErr;

    const campaigns_by_status: Record<string, number> = { draft: 0, active: 0, paused: 0, ended: 0 };
    for (const r of campaignRows ?? []) {
      const s = String((r as { status: string }).status);
      campaigns_by_status[s] = (campaigns_by_status[s] ?? 0) + 1;
    }

    async function countEvents(since: string, eventType: string) {
      const { count, error } = await admin
        .from("ads_events")
        .select("*", { count: "exact", head: true })
        .eq("event_type", eventType)
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    }

    const [imp7, clk7, book7, imp30, clk30, book30] = await Promise.all([
      countEvents(since7, "impression"),
      countEvents(since7, "click"),
      countEvents(since7, "book"),
      countEvents(since30, "impression"),
      countEvents(since30, "click"),
      countEvents(since30, "book"),
    ]);

    const { data: paidOrders, error: oErr } = await admin
      .from("ads_budget_orders")
      .select("amount")
      .eq("status", "paid")
      .gte("paid_at", since30);
    if (oErr) throw oErr;

    const prepaid_revenue_30d_zar = (paidOrders ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount ?? 0), 0);

    const { data: spendRows, error: sErr } = await admin.from("ads_campaigns").select("spent, budget");
    if (sErr) throw sErr;
    const total_spent_in_campaigns_zar = (spendRows ?? []).reduce((s, r) => s + Number((r as { spent: number }).spent ?? 0), 0);
    const total_budget_in_campaigns_zar = (spendRows ?? []).reduce((s, r) => s + Number((r as { budget: number }).budget ?? 0), 0);

    return successResponse({
      campaigns_by_status,
      events_7d: { impressions: imp7, clicks: clk7, books: book7 },
      events_30d: { impressions: imp30, clicks: clk30, books: book30 },
      prepaid_revenue_30d_zar,
      total_spent_in_campaigns_zar,
      total_budget_in_campaigns_zar,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error as Error, "Failed to load ads overview");
  }
}
