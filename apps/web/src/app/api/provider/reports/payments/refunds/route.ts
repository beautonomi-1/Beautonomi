import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateKey,
  reportDateRangeFromParams,
  summarizeLedgerLocationAttribution,
} from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    type LedgerRefundRow = {
      id: string;
      transaction_type: string;
      amount: number | null;
      net: number | null;
      booking_id: string | null;
      product_order_id?: string | null;
      created_at: string;
      description?: string | null;
      metadata?: Record<string, unknown> | null;
    };

    const { data: ledgerRows, error: ledgerError } = await supabaseAdmin
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, booking_id, product_order_id, created_at, description, metadata")
      .eq("provider_id", providerId)
      .in("transaction_type", ["refund", "provider_earnings", "payment"])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    if (ledgerError) {
      return handleApiError(new Error("Failed to fetch refund ledger"), "REFUND_LEDGER_FETCH_ERROR", 500);
    }

    const ledgerLocationAttribution = summarizeLedgerLocationAttribution(
      (ledgerRows ?? []) as LedgerRefundRow[],
      locationId || null,
    );
    let rows = (ledgerRows ?? []) as LedgerRefundRow[];
    rows = await filterLedgerRowsForLocation(supabaseAdmin, providerId, rows, locationId || null);

    const refundRows = rows.filter((r) => r.transaction_type === "refund");
    const negativeEarningsRows = rows.filter(
      (r) => r.transaction_type === "provider_earnings" && Number(r.net ?? 0) < 0
    );
    const paymentRows = rows.filter((r) => r.transaction_type === "payment");

    const totalRefunds = refundRows.length;
    const totalRefundAmount = refundRows.reduce((sum, r) => sum + Math.abs(Number(r.amount ?? 0)), 0);
    const providerEarningsReversed = negativeEarningsRows.reduce((sum, r) => sum + Math.abs(Number(r.net ?? r.amount ?? 0)), 0);
    const totalPaymentAmount = paymentRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
    const refundRate = totalPaymentAmount > 0 ? (totalRefundAmount / totalPaymentAmount) * 100 : 0;
    const averageRefundAmount = totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0;

    // Group by payment method
    const refundsByMethod = new Map<string, { count: number; amount: number }>();
    refundRows.forEach((refund) => {
      const method = String(refund.metadata?.payment_method || refund.metadata?.provider || "ledger");
      const existing = refundsByMethod.get(method) || { count: 0, amount: 0 };
      refundsByMethod.set(method, {
        count: existing.count + 1,
        amount: existing.amount + Math.abs(Number(refund.amount || 0)),
      });
    });

    const methodBreakdown = Array.from(refundsByMethod.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        amount: data.amount,
        percentage: totalRefundAmount > 0 ? (data.amount / totalRefundAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Group by day
    const dailyRefunds = new Map<string, { count: number; amount: number }>();
    refundRows.forEach((refund) => {
      const date = reportDateKey(refund.created_at, reportContext.timezone);
      const existing = dailyRefunds.get(date) || { count: 0, amount: 0 };
      dailyRefunds.set(date, {
        count: existing.count + 1,
        amount: existing.amount + Math.abs(Number(refund.amount || 0)),
      });
    });

    const dailyBreakdown = Array.from(dailyRefunds.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return successResponse({
      totalRefunds,
      totalRefundAmount,
      providerEarningsReversed,
      netProviderImpact: providerEarningsReversed || totalRefundAmount,
      totalPaymentAmount,
      refundRate,
      averageRefundAmount,
      methodBreakdown,
      dailyBreakdown,
      locationAttribution: ledgerLocationAttribution,
      reportBasis:
        `Refund report is based on finance_transactions refund rows by ledger created_at (bucketed by provider timezone day). ${ledgerLocationAttribution.note} Provider reversal impact is shown separately from customer refund gross.`,
      recentRefunds: refundRows
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20)
        .map((r) => ({
          id: r.id,
          amount: Math.abs(Number(r.amount ?? 0)),
          created_at: r.created_at,
          booking_id: r.booking_id,
          reason: r.metadata?.reason || r.description || undefined,
        })),
    });
  } catch (error) {
    return handleApiError(error, "REFUNDS_ERROR", 500);
  }
}
