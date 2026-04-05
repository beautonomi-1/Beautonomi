import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { getTenantRegionConfig } from "@/lib/regions/config";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

/**
 * GET /api/provider/payouts/statements
 *
 * Returns a payout statement for the given date range: earnings, payouts, and summary for export/tax.
 * Query: from=YYYY-MM-DD&to=YYYY-MM-DD (default last 90 days).
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);
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
    const now = new Date();
    const defaultTo = now;
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 90);

    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const fromDate = fromParam ? new Date(fromParam + "T00:00:00") : defaultFrom;
    const toDate = toParam ? new Date(toParam + "T23:59:59") : defaultTo;

    const { totalRevenue, revenueByBooking, revenueByDate: _rd } = await getProviderRevenue(
      supabase,
      providerId,
      fromDate,
      toDate
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
      payout_number: p.payout_number,
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
    const totalPlatformFees = Math.max(0, totalRevenue - totalPayouts);

    return successResponse({
      period: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
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
