import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
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
    const period = searchParams.get("period") || "month"; // month, quarter, year

    let currentFromDate: Date;
    const currentToDate = new Date();
    let previousFromDate: Date;
    let previousToDate: Date;

    switch (period) {
      case "month":
        currentFromDate = new Date(currentToDate.getFullYear(), currentToDate.getMonth(), 1);
        previousToDate = new Date(currentFromDate);
        previousToDate.setDate(previousToDate.getDate() - 1);
        previousFromDate = new Date(previousToDate.getFullYear(), previousToDate.getMonth(), 1);
        break;
      case "quarter":
        const currentQuarter = Math.floor(currentToDate.getMonth() / 3);
        currentFromDate = new Date(currentToDate.getFullYear(), currentQuarter * 3, 1);
        previousToDate = new Date(currentFromDate);
        previousToDate.setDate(previousToDate.getDate() - 1);
        const previousQuarter = Math.floor(previousToDate.getMonth() / 3);
        previousFromDate = new Date(previousToDate.getFullYear(), previousQuarter * 3, 1);
        break;
      case "year":
        currentFromDate = new Date(currentToDate.getFullYear(), 0, 1);
        previousToDate = new Date(currentFromDate);
        previousToDate.setDate(previousToDate.getDate() - 1);
        previousFromDate = new Date(previousToDate.getFullYear(), 0, 1);
        break;
      default:
        currentFromDate = subMonths(currentToDate, 1);
        previousToDate = currentFromDate;
        previousFromDate = subMonths(previousToDate, 1);
    }

    // Get provider revenue from finance_transactions for both periods
    const { totalRevenue: currentRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      currentFromDate,
      currentToDate
    );

    const { totalRevenue: previousRevenue } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      previousFromDate,
      previousToDate
    );

    // Get current period bookings (for counts and status)
    const { data: currentBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .gte("scheduled_at", currentFromDate.toISOString())
      .lte("scheduled_at", currentToDate.toISOString());

    // Get previous period bookings (for counts and status)
    const { data: previousBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, customer_id, scheduled_at")
      .eq("provider_id", providerId)
      .gte("scheduled_at", previousFromDate.toISOString())
      .lte("scheduled_at", previousToDate.toISOString());

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
    });
  } catch (error) {
    return handleApiError(error, "BUSINESS_COMPARISON_ERROR", 500);
  }
}
