import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES } from "@/lib/reports/constants";

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


    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError || !providerData?.id) {
      return handleApiError(
        new Error('Provider profile not found'),
        'NOT_FOUND',
        404
      );
    }
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get("from")
      ? startOfDay(new Date(searchParams.get("from")!))
      : startOfDay(subDays(new Date(), 90));
    const toDate = searchParams.get("to")
      ? endOfDay(new Date(searchParams.get("to")!))
      : endOfDay(new Date());

    // Use provider_earnings only (consistent with dashboard revenue)
    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES };

    const { totalRevenue: _totalRevenue, revenueByBooking, revenueByDate: _revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      null,
      dashOpts
    );

    // Get bookings to match with finance transactions
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, scheduled_at, status, total_amount')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString())
      .in('status', ['confirmed', 'completed']);

    // Get service_fee and refund data from finance_transactions (ledger-consistent)
    const bookingIds = bookings?.map((b) => b.id) || [];
    let feeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("booking_id, transaction_type, amount, net")
      .eq("provider_id", providerId)
      .in("transaction_type", ["service_fee", "refund", "payment"])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    const { data: feeRows } = await feeQuery;

    // Build per-booking fee/refund/gross maps from ledger
    // platformFee = platform commission (stored as `net` on `payment` rows) + customer service fee
    const feeMap = new Map<string, { grossAmount: number; platformFee: number; refundedAmount: number }>();
    (feeRows ?? []).forEach((row: any) => {
      if (!row.booking_id) return;
      const existing = feeMap.get(row.booking_id) || { grossAmount: 0, platformFee: 0, refundedAmount: 0 };
      if (row.transaction_type === "payment") {
        existing.grossAmount += Math.abs(Number(row.amount || 0));
        existing.platformFee += Math.abs(Number(row.net || 0));
      } else if (row.transaction_type === "service_fee") {
        existing.platformFee += Math.abs(Number(row.amount || 0));
      } else if (row.transaction_type === "refund") {
        existing.refundedAmount += Math.abs(Number(row.amount || 0));
      }
      feeMap.set(row.booking_id, existing);
    });

    // Calculate payouts from finance_transactions (actual provider earnings)
    // Group by booking to show per-booking payouts
    const payouts = Array.from(revenueByBooking.entries())
      .map(([bookingId, payoutAmount]) => {
        const fees = feeMap.get(bookingId);
        const grossAmount = fees?.grossAmount || 0;
        const refundedAmount = fees?.refundedAmount || 0;
        const platformFee = fees?.platformFee || 0;
        const netAmount = grossAmount - refundedAmount;

        const booking = bookings?.find((b) => b.id === bookingId);
        const createdAt = booking?.scheduled_at || new Date().toISOString();

        return {
          bookingId,
          grossAmount,
          refundedAmount,
          netAmount,
          platformFee,
          payoutAmount,
          createdAt,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const totalPayouts = payouts.length;
    const totalPayoutAmount = payouts.reduce((sum, p) => sum + p.payoutAmount, 0);
    const totalGrossAmount = payouts.reduce((sum, p) => sum + p.grossAmount, 0);
    const totalPlatformFees = payouts.reduce((sum, p) => sum + p.platformFee, 0);
    const totalRefunded = payouts.reduce((sum, p) => sum + p.refundedAmount, 0);
    const averagePayout = totalPayouts > 0 ? totalPayoutAmount / totalPayouts : 0;

    // Group by month
    const monthlyPayouts = new Map<string, { count: number; amount: number }>();
    payouts.forEach((payout) => {
      const date = new Date(payout.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const existing = monthlyPayouts.get(monthKey) || { count: 0, amount: 0 };
      monthlyPayouts.set(monthKey, {
        count: existing.count + 1,
        amount: existing.amount + payout.payoutAmount,
      });
    });

    const monthlyBreakdown = Array.from(monthlyPayouts.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const platformFeeRate = totalGrossAmount > 0 ? totalPlatformFees / totalGrossAmount : 0;

    return successResponse({
      totalPayouts,
      totalPayoutAmount,
      totalGrossAmount,
      totalPlatformFees,
      totalRefunded,
      averagePayout,
      platformFeeRate: platformFeeRate * 100,
      monthlyBreakdown,
      recentPayouts: payouts.slice(0, 20),
    });
  } catch (error) {
    return handleApiError(error, "PAYOUTS_ERROR", 500);
  }
}
