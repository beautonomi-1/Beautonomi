import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import {
  filterLedgerRowsForLocation,
  getProviderReportContext,
  reportDateRangeFromParams,
} from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const sp = request.nextUrl.searchParams;
    const locationId = sp.get("location_id") || null;
    const { fromDate, toDate } = reportDateRangeFromParams(sp, reportContext.timezone, { defaultDays: 30 });
    const endIso = toDate.toISOString();

    const { data: txns } = await supabaseAdmin
      .from("finance_transactions")
      .select("transaction_type, amount, net, created_at, metadata, booking_id, product_order_id")
      .eq("provider_id", providerId)
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", endIso);

    const all = await filterLedgerRowsForLocation(supabaseAdmin, providerId, txns || [], locationId);
    const bookingIds = [...new Set((all || []).filter((t: any) => t.booking_id).map((t: any) => t.booking_id))];
    let paymentMethodByBooking = new Map<string, string>();
    if (bookingIds.length > 0) {
      const { data: payments } = await supabaseAdmin
        .from("booking_payments")
        .select("booking_id, payment_method, payment_provider, amount, status, created_at")
        .in("booking_id", bookingIds)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      paymentMethodByBooking = new Map(
        (payments || []).map((p: any) => [
          p.booking_id,
          String(p.payment_method || p.payment_provider || "other").toLowerCase(),
        ]),
      );
    }

    let totalCollected = 0;
    let totalRefunded = 0;
    let providerRefundImpact = 0;
    const methodMap = new Map<string, { amount: number; count: number }>();

    let cancellationFeesTotal = 0;
    let tipsCollected = 0;
    const recentRefundList: { date: string; amount: number; reason?: string; booking_ref?: string }[] = [];

    all.forEach((t: any) => {
      const val = Number(t.net ?? t.amount ?? 0);
      if (t.transaction_type === "provider_earnings") {
        if (val > 0) {
          totalCollected += val;
          const method = paymentMethodByBooking.get(t.booking_id) || (t.metadata as any)?.payment_method || "other";
          const existing = methodMap.get(method) || { amount: 0, count: 0 };
          existing.amount += val;
          existing.count += 1;
          methodMap.set(method, existing);
        } else if (val < 0) {
          providerRefundImpact += Math.abs(val);
        }
      } else if (t.transaction_type === "refund") {
        const refundAmt = Math.abs(Number(t.net ?? t.amount ?? 0));
        totalRefunded += refundAmt;
        recentRefundList.push({
          date: t.created_at,
          amount: refundAmt,
          reason: (t.metadata as any)?.reason || undefined,
          booking_ref: t.booking_id || undefined,
        });
      } else if (t.transaction_type === "cancellation_fee") {
        cancellationFeesTotal += Math.abs(val);
      } else if (t.transaction_type === "tip") {
        tipsCollected += Math.abs(val);
      } else if (t.transaction_type === "wallet_payment" || t.transaction_type === "gift_card_payment") {
        const method = t.transaction_type === "wallet_payment" ? "wallet" : "gift_card";
        const amount = Math.abs(Number(t.amount ?? t.net ?? 0));
        if (amount > 0) {
          const existing = methodMap.get(method) || { amount: 0, count: 0 };
          existing.amount += amount;
          existing.count += 1;
          methodMap.set(method, existing);
        }
      }
    });

    const { data: payouts } = await supabaseAdmin
      .from("finance_transactions")
      .select("amount, created_at, transaction_type")
      .eq("provider_id", providerId)
      .eq("transaction_type", "payout")
      .order("created_at", { ascending: false })
      .limit(5);

    const recentPayouts = (payouts || []).map((p: any) => ({
      date: p.created_at,
      amount: Number(p.amount || 0),
      status: "completed",
    }));

    return successResponse({
      total_collected: totalCollected,
      provider_earnings_collected: totalCollected,
      total_refunded: totalRefunded + providerRefundImpact,
      provider_refund_impact: providerRefundImpact,
      cancellation_fees: cancellationFeesTotal,
      tips_collected: tipsCollected,
      net_revenue: totalCollected + cancellationFeesTotal - totalRefunded - providerRefundImpact,
      basis_note:
        "Provider earnings are positive provider_earnings ledger rows by payment/ledger date. Payment methods come from completed booking payments where available. Tips are reported separately; refunds and provider earning reversals reduce net service earnings.",
      by_method: Array.from(methodMap.entries())
        .map(([method, data]) => ({ method, ...data }))
        .filter((row) => row.amount > 0 || row.count > 0)
        .sort((a, b) => b.amount - a.amount),
      recent_payouts: recentPayouts,
      recent_refunds: recentRefundList
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10),
    });
  } catch (error) {
    console.error("Error in payments report:", error);
    return handleApiError(error, "Failed to generate payments report");
  }
}
