import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { startOfDay, endOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns";
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

    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get("location_id");
    const period = searchParams.get("period") || "month"; // month, quarter, year

    let fromDate: Date;
    const toDate = endOfDay(new Date());

    switch (period) {
      case "week":
        fromDate = startOfWeek(toDate, { weekStartsOn: 1 });
        break;
      case "month":
        fromDate = startOfMonth(toDate);
        break;
      case "quarter":
        fromDate = startOfQuarter(toDate);
        break;
      case "year":
        fromDate = startOfYear(toDate);
        break;
      default:
        fromDate = startOfMonth(toDate);
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

    // Get refund data from ledger (finance_transactions) for consistency.
    // NOTE: finance_transactions does NOT have a `location_id` column. Location scoping
    // for refunds is applied indirectly by restricting to booking_ids of the filtered
    // bookings in the period. Non-booking refunds (e.g. gift card voids) are provider-wide
    // and therefore excluded when a specific location is selected — matches dashboard behavior.
    const bookingIds = bookings?.map((b) => b.id) || [];
    let refundQuery = supabaseAdmin
      .from("finance_transactions")
      .select("amount, booking_id")
      .eq("provider_id", providerId)
      .eq("transaction_type", "refund")
      .gte("created_at", startOfDay(fromDate).toISOString())
      .lte("created_at", endOfDay(toDate).toISOString());
    if (locationId) {
      if (bookingIds.length > 0) {
        refundQuery = refundQuery.in("booking_id", bookingIds);
      } else {
        refundQuery = refundQuery.eq("booking_id", "00000000-0000-0000-0000-000000000000");
      }
    }
    const { data: refundRows } = await refundQuery;

    // Get payment counts from booking_payments for stats
    let paymentsCountQuery = supabaseAdmin
      .from("booking_payments")
      .select("id, status", { count: "exact" })
      .gte("created_at", fromDate.toISOString())
      .lte("created_at", toDate.toISOString());
    if (bookingIds.length > 0) {
      paymentsCountQuery = paymentsCountQuery.in("booking_id", bookingIds);
    } else {
      paymentsCountQuery = paymentsCountQuery.eq("booking_id", "00000000-0000-0000-0000-000000000000");
    }
    const { data: payments } = await paymentsCountQuery;

    const periodStart = startOfDay(fromDate);
    const periodEnd = toDate;
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
    const successfulPayments = payments?.filter((p: any) => p.status === "completed" || p.status === "succeeded").length || 0;
    const totalRefunded = Math.abs(refundRows?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0);

    // Cancellation fees: provider-retained income from late cancellations
    let cancellationFeesTotal = 0;
    let tipsTotal = 0;
    let additionalChargesTotal = 0;
    try {
      const { data: extraLedgerRows } = await supabaseAdmin
        .from("finance_transactions")
        .select("transaction_type, net, amount")
        .eq("provider_id", providerId)
        .in("transaction_type", ["cancellation_fee", "tip", "additional_charge", "additional_charge_payment"])
        .gte("created_at", periodStart.toISOString())
        .lte("created_at", periodEnd.toISOString());
      for (const r of extraLedgerRows ?? []) {
        const row = r as { transaction_type: string; net?: number; amount?: number };
        if (row.transaction_type === "cancellation_fee") {
          cancellationFeesTotal += Number(row.net ?? row.amount ?? 0);
        } else if (row.transaction_type === "tip") {
          tipsTotal += Math.abs(Number(row.amount ?? row.net ?? 0));
        } else if (row.transaction_type === "additional_charge" || row.transaction_type === "additional_charge_payment") {
          additionalChargesTotal += Number(row.net ?? row.amount ?? 0);
        }
      }
    } catch { /* non-critical */ }

    const netRevenue = totalRevenue + cancellationFeesTotal - totalRefunded;

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
      cancellationFees: cancellationFeesTotal,
      tipsTotal,
      additionalChargesTotal,
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
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_OVERVIEW_ERROR", 500);
  }
}
