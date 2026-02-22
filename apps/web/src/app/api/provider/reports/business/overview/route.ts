import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays, subMonths } from "date-fns";

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

    // Calculate metrics from finance_transactions (more accurate - uses actual provider earnings)
    // Get provider earnings from finance_transactions for the period
    const financeQuery = supabaseAdmin
      .from("finance_transactions")
      .select("id, transaction_type, amount, net, booking_id, created_at")
      .eq("provider_id", providerId)
      .in("transaction_type", ["provider_earnings", "travel_fee", "tip"])
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    
    const { data: financeTransactions } = await financeQuery;
    
    // Get booking information for filtering by location and booking_source
    const financeBookingIds = [...new Set((financeTransactions || []).filter((t: any) => t.booking_id).map((t: any) => t.booking_id))];
    let bookingMap: Record<string, { booking_source: string | null; location_id: string | null }> = {};
    
    if (financeBookingIds.length > 0) {
      let bookingsForFinanceQuery = supabaseAdmin
        .from("bookings")
        .select("id, booking_source, location_id")
        .in("id", financeBookingIds);
      
      if (locationId) {
        bookingsForFinanceQuery = bookingsForFinanceQuery.eq("location_id", locationId);
      }
      
      const { data: bookingsForFinance } = await bookingsForFinanceQuery;
      
      if (bookingsForFinance) {
        bookingMap = bookingsForFinance.reduce((acc: any, b: any) => {
          acc[b.id] = {
            booking_source: b.booking_source || null,
            location_id: b.location_id || null,
          };
          return acc;
        }, {});
      }
    }
    
    // Filter transactions by location and include all (for reports, we show all earnings)
    const validTransactions = (financeTransactions || []).filter((t: any) => {
      if (!t.booking_id) return true; // Include non-booking transactions
      if (locationId && bookingMap[t.booking_id]?.location_id !== locationId) return false;
      return true;
    });
    
    // Calculate revenue from finance_transactions (actual provider earnings)
    const totalRevenue = validTransactions.reduce((sum: number, t: any) => sum + Number(t.net || t.amount || 0), 0);
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

    // Calculate average booking value from provider earnings (not booking total)
    // Group finance transactions by booking to get earnings per booking
    const earningsByBooking = new Map<string, number>();
    validTransactions.forEach((t: any) => {
      if (t.booking_id) {
        const current = earningsByBooking.get(t.booking_id) || 0;
        earningsByBooking.set(t.booking_id, current + Number(t.net || t.amount || 0));
      }
    });
    const totalEarningsFromBookings = Array.from(earningsByBooking.values()).reduce((sum, val) => sum + val, 0);
    const bookingsWithEarnings = earningsByBooking.size;
    const averageBookingValue = bookingsWithEarnings > 0 ? totalEarningsFromBookings / bookingsWithEarnings : 0;
    const completionRate = totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShows / totalBookings) * 100 : 0;

    // Get previous period for growth (using finance_transactions for accuracy)
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevFromDate = subDays(fromDate, daysDiff);
    const prevToDate = fromDate;

    const prevFinanceQuery = supabaseAdmin
      .from("finance_transactions")
      .select("net, amount, booking_id")
      .eq("provider_id", providerId)
      .in("transaction_type", ["provider_earnings", "travel_fee", "tip"])
      .gte("created_at", prevFromDate.toISOString())
      .lte("created_at", prevToDate.toISOString());
    
    const { data: prevFinanceTransactions } = await prevFinanceQuery;
    
    // Filter by location if needed
    const prevValidTransactions = (prevFinanceTransactions || []).filter((t: any) => {
      if (!t.booking_id) return true;
      if (locationId && bookingMap[t.booking_id]?.location_id !== locationId) return false;
      return true;
    });
    
    const prevRevenue = prevValidTransactions.reduce((sum: number, t: any) => sum + Number(t.net || t.amount || 0), 0);
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
