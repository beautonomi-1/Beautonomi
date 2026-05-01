import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { dateRangeBoundsUtc, formatDateYmd, formatInTz } from "@/lib/dates/provider-tz";
import { getProviderReportContext } from "@/lib/reports/provider-report-utils";

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
    const periodParam = searchParams.get("period") || "month"; // month, quarter, year
    const locationId = searchParams.get("location_id") || undefined;

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const timezone = reportContext.timezone;
    const todayYmd = formatDateYmd(new Date(), timezone);
    const zNow = toZonedTime(new Date(), timezone);
    const monthsBack =
      periodParam === "quarter" ? 4 : periodParam === "year" ? 24 : 12;
    const fromYmd = formatDateYmd(subMonths(zNow, monthsBack), timezone);
    const { fromIso, toIso } = dateRangeBoundsUtc(fromYmd, todayYmd, timezone);
    const fromDate = new Date(fromIso);
    const toDate = new Date(toIso);

    // Get all bookings
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, customer_id, scheduled_at, status")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .eq("status", "completed");

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

      if (periodParam === "month") {
        periodKey = formatInTz(date, "yyyy-MM", timezone);
      } else if (periodParam === "quarter") {
        const y = formatInTz(date, "yyyy", timezone);
        const m = Number(formatInTz(date, "M", timezone));
        const quarter = Math.floor((m - 1) / 3) + 1;
        periodKey = `${y}-Q${quarter}`;
      } else {
        periodKey = formatInTz(date, "yyyy", timezone);
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
      reportBasis:
        "Retention is based on completed visits only. Future confirmed bookings are excluded so visit counts and return rates reflect actual completed customer behavior.",
    });
  } catch (error) {
    return handleApiError(error, "CLIENT_RETENTION_ERROR", 500);
  }
}
