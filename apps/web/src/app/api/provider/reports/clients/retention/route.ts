import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";

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

    let fromDate: Date;
    const toDate = new Date();

    switch (period) {
      case "month":
        fromDate = subMonths(toDate, 12);
        break;
      case "quarter":
        fromDate = subMonths(toDate, 4);
        break;
      case "year":
        fromDate = subMonths(toDate, 24);
        break;
      default:
        fromDate = subMonths(toDate, 12);
    }

    // Get all bookings
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, scheduled_at, status")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .in("status", ["confirmed", "completed"]);

    if (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Group bookings by customer
    const customerBookings = new Map<string, Date[]>();
    bookings?.forEach((booking) => {
      if (booking.customer_id) {
        const dates = customerBookings.get(booking.customer_id) || [];
        dates.push(new Date(booking.scheduled_at));
        customerBookings.set(booking.customer_id, dates);
      }
    });

    // Calculate retention metrics
    const totalClients = customerBookings.size;
    let returningClients = 0;
    let newClients = 0;
    const retentionByPeriod: Array<{ period: string; retentionRate: number; clients: number }> = [];

    // Group by period and calculate retention
    const periodMap = new Map<string, Set<string>>();
    bookings?.forEach((booking) => {
      if (!booking.customer_id) return;
      const date = new Date(booking.scheduled_at);
      let periodKey: string;

      if (period === "month") {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      } else if (period === "quarter") {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        periodKey = `${date.getFullYear()}-Q${quarter}`;
      } else {
        periodKey = String(date.getFullYear());
      }

      const clients = periodMap.get(periodKey) || new Set();
      clients.add(booking.customer_id);
      periodMap.set(periodKey, clients);
    });

    // Calculate retention rate for each period
    const periods = Array.from(periodMap.keys()).sort();
    periods.forEach((currentPeriod, index) => {
      if (index === 0) {
        newClients = periodMap.get(currentPeriod)?.size || 0;
        return;
      }

      const previousPeriod = periods[index - 1];
      const currentClients = periodMap.get(currentPeriod) || new Set();
      const previousClients = periodMap.get(previousPeriod) || new Set();

      // Clients who returned from previous period
      const returnedClients = Array.from(currentClients).filter((c) => previousClients.has(c));
      const retentionRate = previousClients.size > 0
        ? (returnedClients.length / previousClients.size) * 100
        : 0;

      retentionByPeriod.push({
        period: currentPeriod,
        retentionRate,
        clients: currentClients.size,
      });
    });

    // Calculate overall retention
    customerBookings.forEach((dates) => {
      if (dates.length > 1) {
        returningClients += 1;
      } else {
        newClients += 1;
      }
    });

    const overallRetentionRate = totalClients > 0
      ? (returningClients / totalClients) * 100
      : 0;

    // Calculate average visits per client
    let totalVisits = 0;
    customerBookings.forEach((dates) => {
      totalVisits += dates.length;
    });
    const averageVisitsPerClient = totalClients > 0 ? totalVisits / totalClients : 0;

    return successResponse({
      totalClients,
      newClients,
      returningClients,
      overallRetentionRate,
      averageVisitsPerClient,
      retentionByPeriod,
    });
  } catch (error) {
    return handleApiError(error, "CLIENT_RETENTION_ERROR", 500);
  }
}
