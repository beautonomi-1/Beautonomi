import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { subDays } from "date-fns";

/**
 * GET /api/admin/reports/gift-cards
 *
 * Report-hub variant of /api/admin/gift-cards/metrics. Returns the flat shape
 * that `ReportDetailPage` expects (totalSold, totalSalesValue, totalRedeemed,
 * outstandingLiability, redemptionRate, activeCards, salesByDay[]).
 *
 * Gated on the same section as the other report endpoints (OVERVIEW) so it
 * shows up wherever the Reports hub is accessible.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const startDateParam = searchParams.get("start_date");
    const endDateParam = searchParams.get("end_date");

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      switch (period) {
        case "7d":
          startDate = subDays(now, 7);
          break;
        case "30d":
          startDate = subDays(now, 30);
          break;
        case "90d":
          startDate = subDays(now, 90);
          break;
        case "1y":
          startDate = subDays(now, 365);
          break;
        default:
          startDate = subDays(now, 30);
      }
    }

    let salesTransactions: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
    try {
      salesTransactions = await fetchFinanceLedgerRowsForTenant(
        supabase,
        tenantId,
        { start: startDate.toISOString(), end: endDate.toISOString() },
        { transactionType: "gift_card_sale" }
      );
    } catch (e) {
      console.error("[reports/gift-cards] sales ledger failed", e);
    }

    const { data: orders } = await supabase
      .from("gift_card_orders")
      .select("id, amount, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());

    const { data: redemptions } = await supabase
      .from("gift_card_redemptions")
      .select("id, amount, status, captured_at, created_at, bookings!inner(tenant_id)")
      .eq("bookings.tenant_id", tenantId)
      .eq("status", "captured")
      .not("captured_at", "is", null)
      .gte("captured_at", startDate.toISOString())
      .lte("captured_at", endDate.toISOString());

    const { data: activeGiftCards } = await supabase
      .from("gift_cards")
      .select("balance, initial_balance")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gt("balance", 0);

    const totalSalesValue = (salesTransactions || []).reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0
    );
    const totalSalesNet = (salesTransactions || []).reduce(
      (sum, t) => sum + Number(t.net || 0),
      0
    );
    const totalSold = (orders || []).length;
    const totalRedemptionCount = (redemptions || []).length;
    const totalRedemptionValue = (redemptions || []).reduce(
      (sum, r) => sum + Number(r.amount || 0),
      0
    );
    const outstandingLiability = (activeGiftCards || []).reduce(
      (sum, g) => sum + Number(g.balance || 0),
      0
    );
    const totalIssued = (activeGiftCards || []).reduce(
      (sum, g) => sum + Number(g.initial_balance || 0),
      0
    );
    const activeCards = (activeGiftCards || []).length;
    const redemptionRate = totalSold > 0 ? (totalRedemptionCount / totalSold) * 100 : 0;

    // Sales by day (non-empty days only — the SPA auto-shows what we return)
    const salesByDayMap: Record<string, { sales: number; count: number }> = {};
    (salesTransactions || []).forEach((t) => {
      if (!t.created_at) return;
      const date = new Date(t.created_at).toISOString().split("T")[0];
      if (!salesByDayMap[date]) salesByDayMap[date] = { sales: 0, count: 0 };
      salesByDayMap[date].sales += Number(t.amount || 0);
      salesByDayMap[date].count += 1;
    });
    const salesByDay = Object.entries(salesByDayMap)
      .map(([date, v]) => ({ date, sales: v.sales, count: v.count }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const redemptionsByDayMap: Record<string, { value: number; count: number }> = {};
    (redemptions || []).forEach((r) => {
      const stamp = r.captured_at || r.created_at;
      if (!stamp) return;
      const date = new Date(stamp).toISOString().split("T")[0];
      if (!redemptionsByDayMap[date]) redemptionsByDayMap[date] = { value: 0, count: 0 };
      redemptionsByDayMap[date].value += Number(r.amount || 0);
      redemptionsByDayMap[date].count += 1;
    });
    const redemptionsByDay = Object.entries(redemptionsByDayMap)
      .map(([date, v]) => ({ date, value: v.value, count: v.count }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return successResponse({
      period,
      totalSold,
      totalSalesValue,
      totalSalesNet,
      totalRedeemed: totalRedemptionCount,
      totalRedemptionValue,
      outstandingLiability,
      totalIssued,
      activeCards,
      redemptionRate: Number(redemptionRate.toFixed(1)),
      salesByDay,
      redemptionsByDay,
      accounting: {
        note: "Gift card sales are a liability until redeemed. Platform recognised revenue is the commission on the underlying booking when the gift card is redeemed.",
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load gift card report");
  }
}
