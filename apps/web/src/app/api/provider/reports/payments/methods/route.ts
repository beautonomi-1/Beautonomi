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

    // Get bookings
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    const bookingIds = bookings?.map((b) => b.id) || [];

    // Get payments
    let paymentsQuery = supabaseAdmin
      .from('payments')
      .select('id, amount, status, payment_provider, created_at')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    if (bookingIds.length > 0) {
      paymentsQuery = paymentsQuery.in('booking_id', bookingIds);
    } else {
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

    // Group by payment method
    const methodMap = new Map<string, {
      method: string;
      totalCount: number;
      successfulCount: number;
      failedCount: number;
      totalAmount: number;
      successfulAmount: number;
      failedAmount: number;
      averageAmount: number;
    }>();

    payments?.forEach((payment) => {
      const method = payment.payment_provider || 'unknown';
      const existing = methodMap.get(method) || {
        method,
        totalCount: 0,
        successfulCount: 0,
        failedCount: 0,
        totalAmount: 0,
        successfulAmount: 0,
        failedAmount: 0,
        averageAmount: 0,
      };

      existing.totalCount += 1;
      existing.totalAmount += Number(payment.amount || 0);

      if (payment.status === 'completed') {
        existing.successfulCount += 1;
        existing.successfulAmount += Number(payment.amount || 0);
      } else if (payment.status === 'failed') {
        existing.failedCount += 1;
        existing.failedAmount += Number(payment.amount || 0);
      }

      methodMap.set(method, existing);
    });

    const methods = Array.from(methodMap.values())
      .map((method) => ({
        ...method,
        averageAmount: method.totalCount > 0 ? method.totalAmount / method.totalCount : 0,
        successRate: method.totalCount > 0 ? (method.successfulCount / method.totalCount) * 100 : 0,
        percentage: payments && payments.length > 0
          ? (method.totalAmount / payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)) * 100
          : 0,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const totalPayments = payments?.length || 0;
    const totalAmount = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

    return successResponse({
      totalPayments,
      totalAmount,
      methods,
    });
  } catch (error) {
    return handleApiError(error, "PAYMENT_METHODS_ERROR", 500);
  }
}
