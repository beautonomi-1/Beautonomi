import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

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
    let fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();

    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_REPORT_DAYS) {
      fromDate = subDays(toDate, MAX_REPORT_DAYS);
    }

    // Get payments for bookings associated with this provider (capped for performance)
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString())
      .limit(MAX_BOOKINGS_FOR_REPORT);

    const bookingIds = bookings?.map((b) => b.id) || [];

    // Get payments for these bookings
    // Handle case where there are no bookings gracefully
    let paymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, amount, status, payment_provider, refunded_amount, created_at')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (bookingIds.length > 0) {
      paymentsQuery = paymentsQuery.in('booking_id', bookingIds);
    } else {
      // If no bookings, return empty result set
      paymentsQuery = paymentsQuery.eq('booking_id', '00000000-0000-0000-0000-000000000000');
    }

    const { data: payments, error: paymentsError } = await paymentsQuery;

    if (paymentsError) {
      return handleApiError(
        new Error('Failed to fetch payments'),
        'PAYMENTS_FETCH_ERROR',
        500
      );
    }

    // Calculate metrics
    const totalPayments = payments?.length || 0;
    const totalAmount = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const successfulPayments = payments?.filter((p) => p.status === 'completed').length || 0;
    const failedPayments = payments?.filter((p) => p.status === 'failed').length || 0;
    const refundedAmount = payments?.reduce((sum, p) => sum + Number(p.refunded_amount || 0), 0) || 0;
    const netAmount = totalAmount - refundedAmount;
    const averageTransactionValue = totalPayments > 0 ? totalAmount / totalPayments : 0;
    const refundRate = totalAmount > 0 ? (refundedAmount / totalAmount) * 100 : 0;

    // Payments by method
    const paymentsByMethodMap = new Map<string, { count: number; amount: number }>();
    payments?.forEach((payment) => {
      const method = payment.payment_provider || 'unknown';
      const existing = paymentsByMethodMap.get(method) || { count: 0, amount: 0 };
      paymentsByMethodMap.set(method, {
        count: existing.count + 1,
        amount: existing.amount + Number(payment.amount || 0),
      });
    });

    const paymentsByMethod = Array.from(paymentsByMethodMap.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        amount: data.amount,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // Payments by status
    const paymentsByStatusMap = new Map<string, { count: number; amount: number }>();
    payments?.forEach((payment) => {
      const status = payment.status || 'unknown';
      const existing = paymentsByStatusMap.get(status) || { count: 0, amount: 0 };
      paymentsByStatusMap.set(status, {
        count: existing.count + 1,
        amount: existing.amount + Number(payment.amount || 0),
      });
    });

    const paymentsByStatus = Array.from(paymentsByStatusMap.entries())
      .map(([status, data]) => ({
        status,
        count: data.count,
        amount: data.amount,
      }))
      .sort((a, b) => b.count - a.count);

    return successResponse({
      totalPayments,
      totalAmount,
      successfulPayments,
      failedPayments,
      refundedAmount,
      netAmount,
      paymentsByMethod,
      paymentsByStatus,
      averageTransactionValue,
      refundRate,
    });
  } catch (error) {
    console.error("Error in payment summary report:", error);
    return handleApiError(error, "Failed to generate payment summary report");
  }
}
