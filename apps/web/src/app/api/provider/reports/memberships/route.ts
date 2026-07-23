import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_FINANCE_TRANSACTIONS, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { getProviderReportContext, reportDateKey, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { isMembershipProviderEarnings } from "@/lib/reports/provider-revenue-semantics";

/**
 * GET /api/provider/reports/memberships
 *
 * Salon membership sales (deferred liability), recognized provider earnings from
 * membership sales, active subscribers, and member discounts applied in the period.
 */
export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate, fromYmd, toYmd } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });

    const ledgerQuery = supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, created_at, booking_id, product_order_id, description")
      .eq("provider_id", providerId)
      .in("transaction_type", [
        "membership_sale",
        "membership_provider_earnings",
        "provider_earnings",
        "membership_discount",
      ])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: true });

    const ledgerRows = await fetchAllLedgerPages(
      ledgerQuery as Parameters<typeof fetchAllLedgerPages>[0],
      MAX_FINANCE_TRANSACTIONS,
    );

    let grossSales = 0;
    let recognizedEarnings = 0;
    let memberDiscounts = 0;
    const salesByDay = new Map<string, { gross: number; count: number }>();

    for (const row of ledgerRows) {
      const amount = Number(row.amount ?? 0);
      const net = Number(row.net ?? row.amount ?? 0);
      const date = reportDateKey(row.created_at, reportContext.timezone);

      if (row.transaction_type === "membership_sale") {
        grossSales += amount;
        const existing = salesByDay.get(date) ?? { gross: 0, count: 0 };
        existing.gross += amount;
        existing.count += 1;
        salesByDay.set(date, existing);
      } else if (
        row.transaction_type === "membership_provider_earnings" ||
        isMembershipProviderEarnings(row)
      ) {
        recognizedEarnings += net;
      } else if (row.transaction_type === "membership_discount") {
        memberDiscounts += Math.abs(net);
      }
    }

    const { count: activeSubscribers } = await supabaseAdmin
      .from("user_memberships")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "active");

    const reportBasis =
      `Period ${fromYmd}–${toYmd} (${reportContext.timezone}). ` +
      `Gross sales use membership_sale.amount (deferred liability — not additive with recognized earnings). ` +
      `Recognized earnings are membership_provider_earnings rows (post-migration 731) or legacy provider_earnings rows without a booking/order link (pre-migration). ` +
      `Member discounts are contra-revenue membership_discount ledger rows. ` +
      `Active subscribers are current user_memberships with status=active (not period-scoped).`;

    return successResponse({
      timezone: reportContext.timezone,
      fromYmd,
      toYmd,
      reportBasis,
      gross_sales: grossSales,
      recognized_earnings: recognizedEarnings,
      member_discounts_applied: memberDiscounts,
      active_subscribers: activeSubscribers ?? 0,
      sales_count: ledgerRows.filter((r) => r.transaction_type === "membership_sale").length,
      sales_by_day: [...salesByDay.entries()]
        .map(([date, v]) => ({ date, gross: v.gross, count: v.count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error("Error in membership report:", error);
    return handleApiError(error, "Failed to generate membership report");
  }
}
