import { NextRequest } from "next/server";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { subDays } from "date-fns";

/**
 * GET /api/admin/reports/memberships
 *
 * Tenant-wide salon membership sales (deferred liability), recognized provider
 * earnings, and active subscribers. Not folded into revenue_streams.total.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "7d":
        startDate = subDays(now, 7);
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

    let salesTransactions: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
    let earningsTransactions: Awaited<ReturnType<typeof fetchFinanceLedgerRowsForTenant>> = [];
    try {
      salesTransactions = await fetchFinanceLedgerRowsForTenant(
        supabase,
        tenantId,
        { start: startDate.toISOString(), end: now.toISOString() },
        { transactionType: "membership_sale" },
      );
      earningsTransactions = await fetchFinanceLedgerRowsForTenant(
        supabase,
        tenantId,
        { start: startDate.toISOString(), end: now.toISOString() },
        { transactionType: "provider_earnings" },
      );
    } catch (e) {
      console.error("[reports/memberships] ledger fetch failed", e);
    }

    const membershipEarnings = (earningsTransactions || []).filter(
      (t) => !t.booking_id && !t.product_order_id,
    );

    const { data: orders } = await supabase
      .from("membership_orders")
      .select("id, amount, status, created_at, provider_id")
      .eq("tenant_id", tenantId)
      .eq("status", "paid")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", now.toISOString());

    const { data: tenantProviders } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId);
    const providerIds = (tenantProviders || []).map((p: { id: string }) => p.id);

    const { count: activeSubscribers } =
      providerIds.length > 0
        ? await supabase
            .from("user_memberships")
            .select("id", { count: "exact", head: true })
            .in("provider_id", providerIds)
            .eq("status", "active")
        : { count: 0 };

    const totalSalesValue = (salesTransactions || []).reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0,
    );
    const totalRecognizedEarnings = membershipEarnings.reduce(
      (sum, t) => sum + Number(t.net ?? t.amount ?? 0),
      0,
    );
    const totalSold = (orders || []).length;

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

    return successResponse({
      period,
      totalSold,
      totalSalesValue,
      totalRecognizedEarnings,
      activeSubscribers: activeSubscribers ?? 0,
      salesByDay,
      reportBasis:
        "Gross membership sales are deferred liability (membership_sale). Recognized earnings are provider_earnings without booking_id/product_order_id. Do not add gross sales to platform revenue_streams.total.",
    });
  } catch (error) {
    return handleApiError(error, "MEMBERSHIP_REPORT_ERROR", 500);
  }
}
