import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { endOfDay, endOfMonth, endOfQuarter, endOfYear, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears } from "date-fns";
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

    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month"; // month, quarter, year
    const locationId = searchParams.get("location_id") || undefined;

    let currentFromDate: Date;
    const now = new Date();
    let currentToDate = endOfDay(now);
    let previousFromDate: Date;
    let previousToDate: Date;

    switch (period) {
      case "month":
        currentFromDate = startOfMonth(now);
        previousFromDate = startOfMonth(subMonths(now, 1));
        previousToDate = endOfMonth(subMonths(now, 1));
        break;
      case "quarter":
        currentFromDate = startOfQuarter(now);
        previousFromDate = startOfQuarter(subQuarters(now, 1));
        previousToDate = endOfQuarter(subQuarters(now, 1));
        break;
      case "year":
        currentFromDate = startOfYear(now);
        previousFromDate = startOfYear(subYears(now, 1));
        previousToDate = endOfYear(subYears(now, 1));
        break;
      default:
        currentFromDate = subMonths(now, 1);
        currentToDate = now;
        previousToDate = currentFromDate;
        previousFromDate = subMonths(previousToDate, 1);
    }

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES };

    const { totalRevenue: currentRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      currentFromDate,
      currentToDate,
      locationId ?? null,
      dashOpts
    );

    const { totalRevenue: previousRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      previousFromDate,
      previousToDate,
      locationId ?? null,
      dashOpts
    );

    // Get current period bookings (for counts and status)
    let currentBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", currentFromDate.toISOString())
      .lte("scheduled_at", currentToDate.toISOString());

    if (locationId) {
      currentBookingsQuery = currentBookingsQuery.eq("location_id", locationId);
    }

    const { data: currentBookings } = await currentBookingsQuery;

    // Get previous period bookings (for counts and status)
    let previousBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .not("status", "in", "(cancelled,no_show)")
      .gte("scheduled_at", previousFromDate.toISOString())
      .lte("scheduled_at", previousToDate.toISOString());

    if (locationId) {
      previousBookingsQuery = previousBookingsQuery.eq("location_id", locationId);
    }

    const { data: previousBookings } = await previousBookingsQuery;

    // Calculate current period metrics
    const currentBookingsCount = currentBookings?.length || 0;
    const currentCompleted = currentBookings?.filter((b) => b.status === "completed").length || 0;
    const currentClients = new Set(currentBookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const currentAverageValue = currentBookingsCount > 0 ? currentRevenue / currentBookingsCount : 0;

    // Calculate previous period metrics
    const previousBookingsCount = previousBookings?.length || 0;
    const previousCompleted = previousBookings?.filter((b) => b.status === "completed").length || 0;
    const previousClients = new Set(previousBookings?.map((b) => b.customer_id).filter(Boolean)).size;
    const previousAverageValue = previousBookingsCount > 0 ? previousRevenue / previousBookingsCount : 0;

    // Calculate growth
    const revenueGrowth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const bookingsGrowth = previousBookingsCount > 0 ? ((currentBookingsCount - previousBookingsCount) / previousBookingsCount) * 100 : 0;
    const clientsGrowth = previousClients > 0 ? ((currentClients - previousClients) / previousClients) * 100 : 0;

    return successResponse({
      period,
      current: {
        revenue: currentRevenue,
        bookings: currentBookingsCount,
        completed: currentCompleted,
        clients: currentClients,
        averageValue: currentAverageValue,
      },
      previous: {
        revenue: previousRevenue,
        bookings: previousBookingsCount,
        completed: previousCompleted,
        clients: previousClients,
        averageValue: previousAverageValue,
      },
      growth: {
        revenue: revenueGrowth,
        bookings: bookingsGrowth,
        clients: clientsGrowth,
      },
      reportBasis:
        "Comparison revenue uses provider_earnings ledger rows. Booking and client counts exclude cancelled/no-show bookings in each calendar period.",
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_COMPARISON_ERROR", 500);
  }
}
