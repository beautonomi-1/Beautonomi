import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );    const searchParams = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

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

    // Get bookings in date range
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from('bookings')
      .select('id, status')
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString())
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (bookingsError) {
      return handleApiError(
        new Error('Failed to fetch bookings'),
        'BOOKINGS_FETCH_ERROR',
        500
      );
    }

    // Get provider revenue from finance_transactions
    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    // Calculate status breakdown
    const statusBreakdown = {
      pending: bookings?.filter((b) => b.status === 'pending').length || 0,
      confirmed: bookings?.filter((b) => b.status === 'confirmed').length || 0,
      completed: bookings?.filter((b) => b.status === 'completed').length || 0,
      cancelled: bookings?.filter((b) => b.status === 'cancelled').length || 0,
      noShow: bookings?.filter((b) => b.status === 'no_show').length || 0,
    };

    const totalBookings = bookings?.length || 0;

    // Calculate rates
    const completionRate =
      totalBookings > 0 ? (statusBreakdown.completed / totalBookings) * 100 : 0;
    const cancellationRate =
      totalBookings > 0 ? (statusBreakdown.cancelled / totalBookings) * 100 : 0;
    const noShowRate =
      totalBookings > 0 ? (statusBreakdown.noShow / totalBookings) * 100 : 0;

    // Calculate revenue by status (from finance_transactions)
    const revenueByStatus = new Map<string, number>();
    bookings?.forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      const existing = revenueByStatus.get(booking.status) || 0;
      revenueByStatus.set(booking.status, existing + bookingRevenue);
    });

    // Create bookings by status array
    const bookingsByStatus = [
      {
        status: 'pending',
        count: statusBreakdown.pending,
        percentage: totalBookings > 0 ? (statusBreakdown.pending / totalBookings) * 100 : 0,
        revenue: revenueByStatus.get('pending') || 0,
      },
      {
        status: 'confirmed',
        count: statusBreakdown.confirmed,
        percentage: totalBookings > 0 ? (statusBreakdown.confirmed / totalBookings) * 100 : 0,
        revenue: revenueByStatus.get('confirmed') || 0,
      },
      {
        status: 'completed',
        count: statusBreakdown.completed,
        percentage: completionRate,
        revenue: revenueByStatus.get('completed') || 0,
      },
      {
        status: 'cancelled',
        count: statusBreakdown.cancelled,
        percentage: cancellationRate,
        revenue: revenueByStatus.get('cancelled') || 0,
      },
      {
        status: 'no_show',
        count: statusBreakdown.noShow,
        percentage: noShowRate,
        revenue: revenueByStatus.get('no_show') || 0,
      },
    ];

    return successResponse({
      statusBreakdown,
      totalBookings,
      completionRate,
      cancellationRate,
      noShowRate,
      bookingsByStatus,
    });
  } catch (error) {
    console.error("Error in booking status report:", error);
    return handleApiError(error, "Failed to generate booking status report");
  }
}
