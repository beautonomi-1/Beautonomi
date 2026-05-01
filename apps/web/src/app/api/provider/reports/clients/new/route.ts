import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { formatInTz } from "@/lib/dates/provider-tz";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

type ClientSummary = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  created_at?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff", "superadmin"],
      request,
    );
    const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultMonthsBack: 6,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    // Get bookings to find first visit per client. With location_id, this means
    // first visit at the selected provider location.
    let allBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, customer_id, scheduled_at, total_amount, status")
      .eq("provider_id", providerId)
      .in("status", ["confirmed", "completed"])
      .order("scheduled_at", { ascending: true });

    if (locationId) {
      allBookingsQuery = allBookingsQuery.eq("location_id", locationId);
    }

    const { data: allBookings, error: allBookingsError } = await allBookingsQuery;

    if (allBookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Find first booking per client
    const firstBookingMap = new Map<string, any>();
    allBookings?.forEach((booking) => {
      if (booking.customer_id && !firstBookingMap.has(booking.customer_id)) {
        firstBookingMap.set(booking.customer_id, booking);
      }
    });

    // Filter new clients (first booking in date range)
    const newClients = Array.from(firstBookingMap.values())
      .filter((booking) => {
        const firstVisit = new Date(booking.scheduled_at);
        return firstVisit >= fromDate && firstVisit <= toDate;
      })
      .map((booking) => ({
        customerId: booking.customer_id,
        firstVisit: booking.scheduled_at,
        firstBookingValue: Number(booking.total_amount || 0),
      }));

    // Get client details
    const clientIds = newClients.map((c) => c.customerId);
    const { data: clients } = clientIds.length > 0
      ? await supabaseAdmin
          .from("users")
          .select("id, full_name, email, created_at")
          .in("id", clientIds)
      : { data: [] };

    const clientRows = (clients || []) as ClientSummary[];
    const clientMap = new Map<string, ClientSummary>(clientRows.map((c) => [c.id, c]));

    // Enrich new clients with details and calculate if they returned
    const enrichedNewClients = newClients.map((client) => {
      const clientDetails = clientMap.get(client.customerId);
      const allClientBookings = allBookings?.filter((b) => b.customer_id === client.customerId) || [];
      const hasReturned = allClientBookings.length > 1;
      const totalSpent = allClientBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

      return {
        customerId: client.customerId,
        clientName: clientDetails?.full_name || "Unknown",
        email: clientDetails?.email || "",
        firstVisit: client.firstVisit,
        firstBookingValue: client.firstBookingValue,
        hasReturned,
        totalBookings: allClientBookings.length,
        completedBookings: allClientBookings.filter((b) => b.status === "completed").length,
        completedSpend: allClientBookings
          .filter((b) => b.status === "completed")
          .reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
        totalSpent,
      };
    }).sort((a, b) => new Date(b.firstVisit).getTime() - new Date(a.firstVisit).getTime());

    // Summary metrics
    const totalNewClients = enrichedNewClients.length;
    const returnedClients = enrichedNewClients.filter((c) => c.hasReturned).length;
    const returnRate = totalNewClients > 0 ? (returnedClients / totalNewClients) * 100 : 0;
    const totalFirstBookingValue = enrichedNewClients.reduce((sum, c) => sum + c.firstBookingValue, 0);
    const averageFirstBookingValue = totalNewClients > 0 ? totalFirstBookingValue / totalNewClients : 0;

    // Group by month
    const monthlyNewClients = new Map<string, number>();
    enrichedNewClients.forEach((client) => {
      const monthKey = formatInTz(new Date(client.firstVisit), "yyyy-MM", reportContext.timezone);
      monthlyNewClients.set(monthKey, (monthlyNewClients.get(monthKey) || 0) + 1);
    });

    const monthlyBreakdown = Array.from(monthlyNewClients.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return successResponse({
      totalNewClients,
      returnedClients,
      returnRate,
      totalFirstBookingValue,
      averageFirstBookingValue,
      monthlyBreakdown,
      newClients: enrichedNewClients.slice(0, 50), // Limit to 50 most recent
      reportBasis:
        "New clients are customers whose first confirmed or completed booking at this provider/location falls in the selected date range. Completed spend is separated from booked value.",
    });
  } catch (error) {
    return handleApiError(error, "NEW_CLIENTS_ERROR", 500);
  }
}
