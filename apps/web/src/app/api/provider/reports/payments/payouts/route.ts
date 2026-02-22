import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";

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
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 90);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get provider revenue from finance_transactions (actual earnings available for payout)
    const { totalRevenue: _totalRevenue, revenueByBooking, revenueByDate: _revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    // Get bookings to match with finance transactions
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, scheduled_at, status, total_amount')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString())
      .in('status', ['confirmed', 'completed']);

    // Get payments for refund information
    const bookingIds = bookings?.map((b) => b.id) || [];
    let paymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, booking_id, amount, refunded_amount, status, created_at')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .eq('status', 'completed');

    if (bookingIds.length > 0) {
      paymentsQuery = paymentsQuery.in('booking_id', bookingIds);
    } else {
      paymentsQuery = paymentsQuery.eq('booking_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: payments } = await paymentsQuery;

    // Create a map of booking_id to payment info
    const paymentMap = new Map<string, { grossAmount: number; refundedAmount: number }>();
    payments?.forEach((payment) => {
      if (payment.booking_id) {
        paymentMap.set(payment.booking_id, {
          grossAmount: Number(payment.amount || 0),
          refundedAmount: Number(payment.refunded_amount || 0),
        });
      }
    });

    // Calculate payouts from finance_transactions (actual provider earnings)
    // Group by booking to show per-booking payouts
    const payouts = Array.from(revenueByBooking.entries())
      .map(([bookingId, payoutAmount]) => {
        const payment = paymentMap.get(bookingId);
        const grossAmount = payment?.grossAmount || 0;
        const refundedAmount = payment?.refundedAmount || 0;
        const netAmount = grossAmount - refundedAmount;
        // Platform fee is the difference between gross and provider earnings
        const platformFee = netAmount > 0 ? netAmount - payoutAmount : 0;

        // Get booking date for sorting
        const booking = bookings?.find((b) => b.id === bookingId);
        const createdAt = booking?.scheduled_at || new Date().toISOString();

        return {
          bookingId,
          grossAmount,
          refundedAmount,
          netAmount,
          platformFee,
          payoutAmount, // This is the actual provider earnings from finance_transactions
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
