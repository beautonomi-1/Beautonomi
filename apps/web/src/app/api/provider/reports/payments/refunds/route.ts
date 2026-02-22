import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";

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
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    // Get bookings for this provider
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    const bookingIds = bookings?.map((b) => b.id) || [];

    // Get payments with refunds
    let paymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, amount, refunded_amount, status, payment_provider, created_at, refunded_at, booking_id')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .gt('refunded_amount', 0);

    if (bookingIds.length > 0) {
      paymentsQuery = paymentsQuery.in('booking_id', bookingIds);
    } else {
      paymentsQuery = paymentsQuery.eq('booking_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: refundedPayments, error: paymentsError } = await paymentsQuery;

    if (paymentsError) {
      return handleApiError(
        new Error('Failed to fetch refunds'),
        'PAYMENTS_FETCH_ERROR',
        500
      );
    }

    // Get all payments for refund rate calculation
    let allPaymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, amount')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (bookingIds.length > 0) {
      allPaymentsQuery = allPaymentsQuery.in('booking_id', bookingIds);
    } else {
      allPaymentsQuery = allPaymentsQuery.eq('booking_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: allPayments } = await allPaymentsQuery;

    const totalRefunds = refundedPayments?.length || 0;
    const totalRefundAmount = refundedPayments?.reduce((sum, p) => sum + Number(p.refunded_amount || 0), 0) || 0;
    const totalPaymentAmount = allPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const refundRate = totalPaymentAmount > 0 ? (totalRefundAmount / totalPaymentAmount) * 100 : 0;
    const averageRefundAmount = totalRefunds > 0 ? totalRefundAmount / totalRefunds : 0;

    // Group by payment method
    const refundsByMethod = new Map<string, { count: number; amount: number }>();
    refundedPayments?.forEach((payment) => {
      const method = payment.payment_provider || 'unknown';
      const existing = refundsByMethod.get(method) || { count: 0, amount: 0 };
      refundsByMethod.set(method, {
        count: existing.count + 1,
        amount: existing.amount + Number(payment.refunded_amount || 0),
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
    refundedPayments?.forEach((payment) => {
      const date = new Date(payment.refunded_at || payment.created_at).toISOString().split("T")[0];
      const existing = dailyRefunds.get(date) || { count: 0, amount: 0 };
      dailyRefunds.set(date, {
        count: existing.count + 1,
        amount: existing.amount + Number(payment.refunded_amount || 0),
      });
    });

    const dailyBreakdown = Array.from(dailyRefunds.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return successResponse({
      totalRefunds,
      totalRefundAmount,
      totalPaymentAmount,
      refundRate,
      averageRefundAmount,
      methodBreakdown,
      dailyBreakdown,
      recentRefunds: refundedPayments?.slice(0, 20) || [],
    });
  } catch (error) {
    return handleApiError(error, "REFUNDS_ERROR", 500);
  }
}
