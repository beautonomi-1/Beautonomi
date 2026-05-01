import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";
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
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);

    const searchParams = request.nextUrl.searchParams;
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, { defaultDays: 90 });
    const locationId = searchParams.get("location_id") || undefined;

    // Use provider_earnings only (consistent with dashboard revenue)
    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: reportContext.timezone };

    const { totalRevenue: _totalRevenue, revenueByBooking, revenueByProductOrder, revenueByDate: _revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId ?? null,
      dashOpts
    );

    // Get bookings to match with finance transactions
    let bookingsQuery = supabaseAdmin
      .from('bookings')
      .select('id, scheduled_at, status, total_amount')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString())
      .in('status', ['confirmed', 'completed']);

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings } = await bookingsQuery;

    // Get platform fee and refund data from finance_transactions (ledger-consistent).
    // Do not treat `payment.amount` as gross customer sales; in several ledger
    // paths it is a commission base, not full customer gross.
    const productOrderIds = Array.from(revenueByProductOrder.keys());
    let productOrders: Array<{ id: string; total_amount?: number; created_at?: string }> = [];
    if (productOrderIds.length > 0) {
      const { data: orderRows } = await supabaseAdmin
        .from("product_orders")
        .select("id, total_amount, created_at")
        .eq("provider_id", providerId)
        .in("id", productOrderIds);
      productOrders = (orderRows ?? []) as typeof productOrders;
    }

    const feeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("booking_id, product_order_id, transaction_type, amount, net")
      .eq("provider_id", providerId)
      .in("transaction_type", ["platform_fee", "service_fee", "refund"])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const { data: rawFeeRows } = await feeQuery;
    const feeLocationAttribution = summarizeLedgerLocationAttribution(
      (rawFeeRows ?? []) as Array<{ booking_id: string | null; product_order_id: string | null }>,
      locationId,
    );
    const feeRows = await filterLedgerRowsForLocation(
      supabaseAdmin,
      providerId,
      (rawFeeRows ?? []) as Array<{ booking_id: string | null; product_order_id: string | null; transaction_type: string; amount: number; net: number }>,
      locationId,
    );

    const feeMap = new Map<string, { platformFee: number; refundedAmount: number }>();
    (feeRows ?? []).forEach((row: any) => {
      const objectKey = row.booking_id ? `booking:${row.booking_id}` : row.product_order_id ? `order:${row.product_order_id}` : null;
      if (!objectKey) return;
      const existing = feeMap.get(objectKey) || { platformFee: 0, refundedAmount: 0 };
      if (row.transaction_type === "platform_fee" || row.transaction_type === "service_fee") {
        existing.platformFee += Math.abs(Number(row.amount || 0));
      } else if (row.transaction_type === "refund") {
        existing.refundedAmount += Math.abs(Number(row.amount || 0));
      }
      feeMap.set(objectKey, existing);
    });

    // Calculate payouts from finance_transactions (actual provider earnings)
    // Group by booking to show per-booking payouts
    const payouts = Array.from(revenueByBooking.entries())
      .map(([bookingId, payoutAmount]) => {
        const fees = feeMap.get(`booking:${bookingId}`);
        const booking = bookings?.find((b) => b.id === bookingId);
        const bookedAmount = Number(booking?.total_amount || 0);
        const refundedAmount = fees?.refundedAmount || 0;
        const platformFee = fees?.platformFee || 0;
        const bookedNetOfRefunds = Math.max(0, bookedAmount - refundedAmount);
        const createdAt = booking?.scheduled_at || new Date().toISOString();

        return {
          bookingId,
          bookedAmount,
          grossAmount: bookedAmount,
          refundedAmount,
          bookedNetOfRefunds,
          netAmount: bookedNetOfRefunds,
          platformFee,
          payoutAmount,
          createdAt,
        };
      })
      .concat(
        Array.from(revenueByProductOrder.entries()).map(([productOrderId, payoutAmount]) => {
          const fees = feeMap.get(`order:${productOrderId}`);
          const order = productOrders.find((o) => o.id === productOrderId);
          const bookedAmount = Number(order?.total_amount || 0);
          const refundedAmount = fees?.refundedAmount || 0;
          const platformFee = fees?.platformFee || 0;
          const bookedNetOfRefunds = Math.max(0, bookedAmount - refundedAmount);

          return {
            bookingId: null,
            productOrderId,
            bookedAmount,
            grossAmount: bookedAmount,
            refundedAmount,
            bookedNetOfRefunds,
            netAmount: bookedNetOfRefunds,
            platformFee,
            payoutAmount,
            createdAt: order?.created_at || new Date().toISOString(),
          };
        })
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalPayouts = payouts.length;
    const totalPayoutAmount = payouts.reduce((sum, p) => sum + p.payoutAmount, 0);
    const totalBookedAmount = payouts.reduce((sum, p) => sum + p.bookedAmount, 0);
    const totalPlatformFees = payouts.reduce((sum, p) => sum + p.platformFee, 0);
    const totalRefunded = payouts.reduce((sum, p) => sum + p.refundedAmount, 0);
    const averagePayout = totalPayouts > 0 ? totalPayoutAmount / totalPayouts : 0;

    // Group by month
    const monthlyPayouts = new Map<string, { count: number; amount: number }>();
    payouts.forEach((payout) => {
      const date = new Date(payout.createdAt);
      const monthKey = reportDateKey(date, reportContext.timezone).slice(0, 7);
      const existing = monthlyPayouts.get(monthKey) || { count: 0, amount: 0 };
      monthlyPayouts.set(monthKey, {
        count: existing.count + 1,
        amount: existing.amount + payout.payoutAmount,
      });
    });

    const monthlyBreakdown = Array.from(monthlyPayouts.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const platformFeeRate = totalBookedAmount > 0 ? totalPlatformFees / totalBookedAmount : 0;

    return successResponse({
      reportBasis: "platform-held provider earnings from finance_transactions by provider-timezone ledger period. Booked amount is the booking total, not gross cash collected.",
      totalPayouts,
      totalPayoutAmount,
      totalBookedAmount,
      totalPlatformFees,
      totalRefunded,
      averagePayout,
      platformFeeRate: platformFeeRate * 100,
      monthlyBreakdown,
      recentPayouts: payouts.slice(0, 20),
      locationAttribution: feeLocationAttribution,
      // Deprecated compatibility aliases. Prefer totalBookedAmount / bookedAmount.
      totalGrossAmount: totalBookedAmount,
    });
  } catch (error) {
    return handleApiError(error, "PAYOUTS_ERROR", 500);
  }
}
