import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requireAnyPermission } from "@/lib/auth/requirePermission";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { dateRangeBoundsUtc, formatDateYmd, nowInTz } from "@/lib/dates/provider-tz";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { subDays } from "date-fns";

/**
 * GET /api/provider/payouts/statements
 *
 * Returns a payout statement for the given date range: earnings, payouts, and summary for export/tax.
 * Query: from=YYYY-MM-DD&to=YYYY-MM-DD (default last 90 days).
 */
export async function GET(request: NextRequest) {
  try {
    // Payout statements are finance data: owner, view_reports or manage_finance only.
    const permissionCheck = await requireAnyPermission(["view_reports", "manage_finance"], request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);

    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      const tenantRegion = await getTenantRegionConfig(
        await resolveTenantIdWithZaFallback(request)
      );
      const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;
      return successResponse({
        period: { from: null, to: null },
        total_earnings: 0,
        total_payouts: 0,
        total_platform_fees: 0,
        payouts: [],
        currency: lastResortCurrency,
      });
    }

    const { data: prow } = await supabase
      .from("providers")
      .select("tenant_id")
      .eq("id", providerId)
      .maybeSingle();
    const effectiveTenantId =
      (prow as { tenant_id?: string | null } | null)?.tenant_id ??
      (await resolveTenantIdWithZaFallback(request));
    const tenantRegion = await getTenantRegionConfig(effectiveTenantId);
    const lastResortCurrency = tenantRegion?.defaultCurrency ?? LAST_RESORT_CURRENCY;

    const { searchParams } = new URL(request.url);
    const supabaseAdmin = getSupabaseAdmin();
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    let fromDate: Date;
    let toDate: Date;
    let periodFromYmd: string;
    let periodToYmd: string;
    if (fromParam || toParam) {
      const r = reportDateRangeFromParams(searchParams, tz, {
        defaultDays: 90,
        maxDays: MAX_REPORT_DAYS,
      });
      fromDate = r.fromDate;
      toDate = r.toDate;
      periodFromYmd = r.fromYmd;
      periodToYmd = r.toYmd;
    } else {
      const zNow = nowInTz(tz);
      const todayYmd = formatDateYmd(zNow, tz);
      const fromYmd = formatDateYmd(subDays(zNow, 89), tz);
      const bounds = dateRangeBoundsUtc(fromYmd, todayYmd, tz);
      fromDate = new Date(bounds.fromIso);
      toDate = new Date(bounds.toIso);
      periodFromYmd = fromYmd;
      periodToYmd = todayYmd;
    }
    const { totalRevenue, revenueByBooking: _rbk, revenueByDate: _rd } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      null,
      { timezone: tz },
    );

    // Platform commission: sum the `net` field of "payment" ledger rows — that is the actual
    // platform commission taken before provider earnings were calculated.
    // This is ledger-based and not affected by payout timing, giving an accurate statement.
    const { data: commissionRows } = await supabaseAdmin
      .from("finance_transactions")
      .select("net")
      .eq("provider_id", providerId)
      .eq("transaction_type", "payment")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    const totalPlatformCommission = (commissionRows || []).reduce(
      (s: number, r: any) => s + Math.max(0, Number(r.net ?? 0)),
      0
    );

    const { data: payoutsRows } = await supabase
      .from("payouts")
      .select("id, payout_number, amount, net_amount, currency, status, created_at, processed_at")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString())
      .order("created_at", { ascending: false });

    const payouts = (payoutsRows || []).map((p: any) => ({
      id: p.id,
      payout_number: p.payout_number || p.id.slice(0, 8).toUpperCase(),
      amount: Number(p.amount ?? 0),
      net_amount: Number(p.net_amount ?? p.amount ?? 0),
      currency: p.currency || lastResortCurrency,
      status: p.status,
      requested_at: p.created_at,
      processed_at: p.processed_at ?? null,
    }));

    const totalPayouts = payouts
      .filter((p: any) => p.status === "completed")
      .reduce((s: number, p: any) => s + p.net_amount, 0);
    // Use ledger-derived commission rather than (revenue - payouts) which has timing issues.
    const totalPlatformFees = totalPlatformCommission;

    return successResponse({
      period: {
        from: periodFromYmd,
        to: periodToYmd,
      },
      total_earnings: totalRevenue,
      total_payouts: totalPayouts,
      total_platform_fees: totalPlatformFees,
      payouts,
      currency: lastResortCurrency,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch payout statement");
  }
}
