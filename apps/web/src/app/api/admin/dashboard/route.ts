import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_OVERVIEW } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchFinanceLedgerRowsForTenant } from "@/lib/admin/finance-ledger-tenant";
import { aggregateFinanceLedgerRows } from "@/lib/admin/aggregate-finance-ledger-rows";
import {
  FINANCE_METRIC_CONTRACT_VERSION,
  getFinanceMetricContracts,
} from "@/lib/admin/finance-metric-contracts";

/** Ledger window for “all-time” dashboard cards (avoids unbounded row fetch). */
const LEDGER_TOTAL_MONTHS = 24;

/** Paid wallet topups (same source as GET /api/admin/finance/summary). */
async function sumWalletTopupsForTenant(
  tenantId: string,
  range: { start: string; end?: string | null }
): Promise<number> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    let q = supabaseAdmin
      .from("wallet_topups")
      .select("amount")
      .eq("status", "paid")
      .eq("tenant_id", tenantId)
      .gte("paid_at", range.start);
    if (range.end) q = q.lte("paid_at", range.end);
    const { data, error } = await q;
    if (error) {
      console.warn("wallet_topups tenant sum failed:", error.message);
      return 0;
    }
    return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  } catch (e) {
    console.warn("wallet_topups sum failed:", e);
    return 0;
  }
}

async function tenantCustomerCountFallback(
  supabase: Awaited<ReturnType<typeof getSupabaseServer>>,
  tenantId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "customer")
    .eq("preferred_home_tenant_id", tenantId);
  if (error) {
    console.error("tenantCustomerCountFallback:", error);
    return 0;
  }
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_OVERVIEW, request);

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);

    if (!supabase) {
      console.error("Failed to get Supabase client");
      return handleApiError(new Error("Database connection failed"), "Failed to load dashboard data");
    }

    const now = new Date();

    // Use tenant timezone for "today" / "this month" boundaries so that dashboard
    // cards align with business hours rather than UTC midnight.
    let tz = "UTC";
    try {
      const { data: tzRow } = await supabase
        .from("platform_settings")
        .select("settings")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const tzFromSettings = (tzRow?.settings as Record<string, unknown> | null)?.timezone as string | undefined;
      if (tzFromSettings) tz = tzFromSettings;
    } catch { /* ignore — fall back to UTC */ }

    // Compute start-of-today in the tenant timezone via Intl
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const parts = formatter.formatToParts(now);
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") p[part.type] = parseInt(part.value, 10);
    }
    // Reconstruct UTC start-of-day in the tenant timezone
    const startOfTodayLocal = new Date(`${p.year ?? now.getUTCFullYear()}-${String(p.month ?? now.getUTCMonth() + 1).padStart(2, "0")}-${String(p.day ?? now.getUTCDate()).padStart(2, "0")}T00:00:00`);
    const offsetMinutes = startOfTodayLocal.getTime() - new Date(`${p.year ?? now.getUTCFullYear()}-${String(p.month ?? now.getUTCMonth() + 1).padStart(2, "0")}-${String(p.day ?? now.getUTCDate()).padStart(2, "0")}T00:00:00Z`).getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    // Adjust today boundary for timezone offset
    startOfToday.setTime(startOfToday.getTime() - offsetMinutes);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: rpcCount, error: rpcErr } = await supabaseAdmin.rpc("admin_dashboard_tenant_customer_count", {
      p_tenant_id: tenantId,
    });
    let totalCustomers =
      typeof rpcCount === "number" ? rpcCount : (rpcCount != null ? Number(rpcCount) : NaN);
    let customerCountUsesFallback = false;
    if (rpcErr || Number.isNaN(totalCustomers)) {
      customerCountUsesFallback = true;
      if (rpcErr) console.warn("admin_dashboard_tenant_customer_count RPC failed (migration applied?):", rpcErr.message);
      totalCustomers = await tenantCustomerCountFallback(supabase, tenantId);
    }

    const queryResults = await Promise.allSettled([
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer")
        .eq("preferred_home_tenant_id", tenantId)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer")
        .eq("preferred_home_tenant_id", tenantId)
        .gte("created_at", startOfLastMonth.toISOString())
        .lte("created_at", endOfLastMonth.toISOString()),
      supabase.from("providers").select("*", { count: "exact", head: true }).eq("status", "active").eq("tenant_id", tenantId),
      supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfLastMonth.toISOString())
        .lte("created_at", endOfLastMonth.toISOString()),
      supabase.from("bookings").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfToday.toISOString()),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfMonth.toISOString()),
      supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .gte("created_at", startOfLastMonth.toISOString())
        .lte("created_at", endOfLastMonth.toISOString()),
      supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_approval")
        .eq("tenant_id", tenantId),
    ]);

    const getCount = (result: PromiseSettledResult<{ count?: number | null; error?: unknown }>) => {
      if (result.status === "rejected") {
        console.error("Query rejected:", result.reason);
        return 0;
      }
      if (result.value.error) {
        console.error("Query error:", result.value.error);
        return 0;
      }
      return result.value.count || 0;
    };

    const usersThisMonth = getCount(queryResults[0]);
    const usersLastMonth = getCount(queryResults[1]);
    const totalProviders = getCount(queryResults[2]);
    const providersThisMonth = getCount(queryResults[3]);
    const providersLastMonth = getCount(queryResults[4]);
    const totalBookings = getCount(queryResults[5]);
    const bookingsToday = getCount(queryResults[6]);
    const bookingsThisMonth = getCount(queryResults[7]);
    const bookingsLastMonth = getCount(queryResults[8]);
    const pendingApprovals = getCount(queryResults[9]);

    const ledgerStart = new Date(now.getFullYear(), now.getMonth() - LEDGER_TOTAL_MONTHS, 1);

    const sumLedger = async (startISO: string, endISO?: string | null) => {
      try {
        const ledgerRows = await fetchFinanceLedgerRowsForTenant(supabase, tenantId, {
          start: startISO,
          end: endISO ?? null,
        });
        return aggregateFinanceLedgerRows(ledgerRows);
      } catch (err) {
        console.error("Error in sumLedger:", err);
        return aggregateFinanceLedgerRows([]);
      }
    };

    let today: ReturnType<typeof aggregateFinanceLedgerRows>;
    let thisMonth: ReturnType<typeof aggregateFinanceLedgerRows>;
    let lastMonth: ReturnType<typeof aggregateFinanceLedgerRows>;
    let total: ReturnType<typeof aggregateFinanceLedgerRows>;
    let wToday = 0;
    let wThisMonth = 0;
    let wLastMonth = 0;
    let wTotal = 0;

    try {
      const results = await Promise.all([
        sumLedger(startOfToday.toISOString()),
        sumLedger(startOfMonth.toISOString()),
        sumLedger(startOfLastMonth.toISOString(), endOfLastMonth.toISOString()),
        sumLedger(ledgerStart.toISOString()),
        sumWalletTopupsForTenant(tenantId, { start: startOfToday.toISOString() }),
        sumWalletTopupsForTenant(tenantId, { start: startOfMonth.toISOString() }),
        sumWalletTopupsForTenant(tenantId, {
          start: startOfLastMonth.toISOString(),
          end: endOfLastMonth.toISOString(),
        }),
        sumWalletTopupsForTenant(tenantId, { start: ledgerStart.toISOString() }),
      ]);
      today = results[0];
      thisMonth = results[1];
      lastMonth = results[2];
      total = results[3];
      wToday = results[4];
      wThisMonth = results[5];
      wLastMonth = results[6];
      wTotal = results[7];
    } catch (err) {
      console.error("Error calculating revenue:", err);
      const zero = aggregateFinanceLedgerRows([]);
      today = zero;
      thisMonth = zero;
      lastMonth = zero;
      total = zero;
      wToday = 0;
      wThisMonth = 0;
      wLastMonth = 0;
      wTotal = 0;
    }

    // ecommerce_platform_fees is NOT double-counted: product order fees are in platform_take_net.
    // Wallet topups are custodial cash inflows (liability), not recognized platform revenue.
    const sumPlatformRecognizedRevenue = (p: typeof total) =>
      p.platform_take_net + p.subscription_net + p.ads_net + p.service_fee_revenue;
    const platformNetTotal = sumPlatformRecognizedRevenue(total);
    const thisMonthPlatformNet = sumPlatformRecognizedRevenue(thisMonth);
    const lastMonthPlatformNet = sumPlatformRecognizedRevenue(lastMonth);
    const revenueGrowth =
      lastMonthPlatformNet !== 0
        ? Math.round(
            ((thisMonthPlatformNet - lastMonthPlatformNet) /
              Math.abs(lastMonthPlatformNet)) *
              100
          )
        : 0;

    const usersGrowth =
      usersLastMonth && usersLastMonth > 0
        ? Math.round(((usersThisMonth || 0) - usersLastMonth) / usersLastMonth * 100)
        : (usersThisMonth || 0) > 0
          ? 100
          : 0;

    const providersGrowth =
      providersLastMonth && providersLastMonth > 0
        ? Math.round(((providersThisMonth || 0) - providersLastMonth) / providersLastMonth * 100)
        : (providersThisMonth || 0) > 0
          ? 100
          : 0;

    const bookingsGrowth =
      bookingsLastMonth && bookingsLastMonth > 0
        ? Math.round(((bookingsThisMonth || 0) - bookingsLastMonth) / bookingsLastMonth * 100)
        : (bookingsThisMonth || 0) > 0
          ? 100
          : 0;

    const generatedAt = new Date().toISOString();

    // `total_users` is historical JSON key = distinct market customers (not all user roles). See metrics_notes + SPA label.
    return successResponse({
      dashboard_timezone: tz,
      total_users: totalCustomers,
      total_providers: totalProviders || 0,
      total_bookings: totalBookings || 0,
      total_revenue: platformNetTotal,
      pending_approvals: pendingApprovals || 0,
      active_bookings_today: bookingsToday || 0,
      revenue_today: sumPlatformRecognizedRevenue(today),
      revenue_this_month: thisMonthPlatformNet,
      revenue_growth: revenueGrowth,
      users_growth: usersGrowth,
      providers_growth: providersGrowth,
      bookings_growth: bookingsGrowth,

      generated_at: generatedAt,
      customer_count_uses_fallback: customerCountUsesFallback,
      customer_signups_this_month: usersThisMonth,
      customer_signups_last_month: usersLastMonth,

      gmv_total: total.service_collected_gross,
      platform_net_total: platformNetTotal,
      platform_commission_gross_total: total.platform_commission_gross,
      platform_refund_impact_total: total.platform_refund_impact,
      gateway_fees_total: total.gateway_fees_services,
      subscription_net_total: total.subscription_net,
      subscription_gateway_fees_total: total.subscription_gateway_fees,
      ads_net_total: total.ads_net,
      tips_total: total.tips_gross,
      taxes_total: total.taxes_gross,
      gift_card_sales_total: total.gift_card_sales,
      membership_sales_total: total.membership_sales,
      refunds_total: total.refunds_gross,

      provider_earnings_total: total.provider_earnings_net,
      provider_earnings_this_month: thisMonth.provider_earnings_net,

      gift_card_metrics: {
        total_sales: total.gift_card_sales,
      },

      platform_revenue: {
        booking_commission: total.platform_take_net,
        subscriptions: total.subscription_net,
        ads: total.ads_net,
        service_fees: total.service_fee_revenue,
        ecommerce_fees_detail: total.ecommerce_platform_fees,
        wallet_topups_cash_collected: wTotal,
        total: platformNetTotal,
      },

      provider_revenue: {
        provider_earnings: total.provider_earnings_net,
        cancellation_fees: total.cancellation_fees_retained,
        tips: total.tips_gross,
        this_month: thisMonth.provider_earnings_net + thisMonth.tips_gross + thisMonth.cancellation_fees_retained,
      },

      revenue_streams: {
        booking_commission: total.platform_take_net,
        subscriptions: total.subscription_net,
        ads: total.ads_net,
        service_fees: total.service_fee_revenue,
        wallet_topups_cash_collected: wTotal,
        total: platformNetTotal,
      },

      metrics_notes: {
        ledger_window_months: LEDGER_TOTAL_MONTHS,
        customer_count_basis:
          "Distinct customers with preferred_home_tenant OR at least one booking in tenant (RPC).",
        customer_count_fallback_basis:
          "When the RPC is unavailable, count is customers with preferred_home_tenant only (understates market reach).",
        customer_growth_basis:
          "New customer accounts with preferred_home_tenant in this market (this month vs last month).",
        platform_net_includes:
          "Booking platform take (includes ecommerce in commission) + subscription net + ads net + customer-paid Platform Fees. Wallet topups are tracked as cash/liability, not recognized revenue. Cancellation fees are provider revenue.",
        bookings_growth_basis: "Bookings created this calendar month vs last month (tenant scope).",
        providers_growth_basis: "Active providers created this calendar month vs last month (tenant scope).",
      },
      metrics_meta: {
        contract_version: FINANCE_METRIC_CONTRACT_VERSION,
        generated_at: generatedAt,
        contracts: getFinanceMetricContracts([
          "platformRecognizedRevenue",
          "liabilityWalletTopups",
          "taxesCollected",
        ]),
      },
    });
  } catch (error) {
    return handleApiError(error, "Failed to load dashboard data");
  }
}
