import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subMonths, startOfDay, endOfDay } from "date-fns";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
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
    const locationId = searchParams.get("location_id");
    const period = searchParams.get("period") || "month"; // month, quarter, year

    let fromDate: Date;
    const toDate = new Date();

    switch (period) {
      case "month":
        fromDate = subMonths(toDate, 1);
        break;
      case "quarter":
        fromDate = subMonths(toDate, 3);
        break;
      case "year":
        fromDate = subMonths(toDate, 12);
        break;
      default:
        fromDate = subMonths(toDate, 1);
    }

    // Get bookings
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, total_amount, scheduled_at, status, customer_id, location_id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    
    // Filter by location if provided
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    
    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get staff
    const { data: staff } = await supabaseAdmin
      .from("provider_staff")
      .select("id")
      .eq("provider_id", providerId);

    // Get payments
    const bookingIds = bookings?.map((b) => b.id) || [];
    let paymentsQuery = supabaseAdmin
      .from("payments")
      .select("id, amount, status, refunded_amount")
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());

    if (bookingIds.length > 0) {
      paymentsQuery = paymentsQuery.in("booking_id", bookingIds);
    } else {
      paymentsQuery = paymentsQuery.eq("booking_id", "00000000-0000-0000-0000-000000000000");
    }

    const { data: payments } = await paymentsQuery;

    const periodStart = startOfDay(fromDate);
    const periodEnd = endOfDay(toDate);
    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES };

    const { totalRevenue, revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      locationId,
      dashOpts
    );
    const totalBookings = bookings?.length || 0;
    const completedBookings = bookings?.filter((b) => b.status === "completed").length || 0;
    const cancelledBookings = bookings?.filter((b) => b.status === "cancelled").length || 0;
    const noShows = bookings?.filter((b) => b.status === "no_show").length || 0;

    const uniqueClients = new Set(bookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const totalStaff = staff?.length || 0;

    const totalPayments = payments?.length || 0;
    const successfulPayments = payments?.filter((p) => p.status === "completed").length || 0;
    const totalRefunded = payments?.reduce((sum, p) => sum + Number(p.refunded_amount || 0), 0) || 0;
    const netRevenue = totalRevenue - totalRefunded;

    const totalEarningsFromBookings = Array.from(revenueByBooking.values()).reduce((sum, val) => sum + val, 0);
    const bookingsWithEarnings = revenueByBooking.size;
    const averageBookingValue = bookingsWithEarnings > 0 ? totalEarningsFromBookings / bookingsWithEarnings : 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShows / totalBookings) * 100 : 0;

    const prevRevenue = await getPreviousPeriodRevenue(
      supabaseAdmin,
      providerId,
      periodStart,
      periodEnd,
      locationId,
      dashOpts
    );
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    return successResponse({
      period,
      totalRevenue,
      netRevenue,
      totalBookings,
      completedBookings,
      cancelledBookings,
      noShows,
      uniqueClients,
      totalStaff,
      totalPayments,
      successfulPayments,
      totalRefunded,
      averageBookingValue,
      completionRate,
      cancellationRate,
      noShowRate,
      revenueGrowth,
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_OVERVIEW_ERROR", 500);
  }
}
