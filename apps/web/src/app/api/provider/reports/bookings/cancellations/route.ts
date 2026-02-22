import { NextRequest } from "next/server";
import { requireRoleInApi, getProviderIdForUser, notFoundResponse, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
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

    // Get cancelled bookings (simplified query to avoid nested join issues)
    const { data: cancelledBookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        cancelled_at,
        cancellation_reason,
        customer_id
      `
      )
      .eq("provider_id", providerId)
      .eq("status", "cancelled")
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("cancelled_at", { ascending: false })
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (bookingsError) {
      console.error("Error fetching cancelled bookings:", bookingsError);
      return handleApiError(
        new Error(`Failed to fetch cancelled bookings: ${bookingsError.message}`),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get client information separately
    const clientIds = new Set<string>();
    cancelledBookings?.forEach((booking: any) => {
      if (booking.customer_id) {
        clientIds.add(booking.customer_id);
      }
    });

    const clientMap = new Map<string, { full_name: string; email: string }>();
    if (clientIds.size > 0) {
      const { data: clients, error: clientError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email")
        .in("id", Array.from(clientIds));

      if (clientError) {
        console.warn("Error fetching clients:", clientError);
      } else {
        clients?.forEach((client: any) => {
          clientMap.set(client.id, {
            full_name: client.full_name || "Unknown",
            email: client.email || "",
          });
        });
      }
    }

    // Get total bookings for cancellation rate (capped for performance)
    const { data: allBookings } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .limit(MAX_BOOKINGS_FOR_REPORT);

    const totalBookings = allBookings?.length || 0;
    const totalCancelled = cancelledBookings?.length || 0;
    const cancellationRate = totalBookings > 0 ? (totalCancelled / totalBookings) * 100 : 0;
    
    // Calculate lost revenue from finance_transactions (what provider would have earned)
    const cancelledBookingIds = cancelledBookings?.map((b) => b.id) || [];
    let lostRevenue = 0;
    if (cancelledBookingIds.length > 0) {
      const { revenueByBooking } = await getProviderRevenue(
        supabaseAdmin,
        providerId,
        fromDate,
        toDate
      );
      // Sum revenue for cancelled bookings (if they had finance_transactions)
      cancelledBookingIds.forEach((bookingId) => {
        lostRevenue += revenueByBooking.get(bookingId) || 0;
      });
    }

    // Group by reason
    const reasonMap = new Map<string, number>();
    cancelledBookings?.forEach((booking) => {
      const reason = booking.cancellation_reason || "No reason provided";
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    });

    const cancellationReasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalCancelled > 0 ? (count / totalCancelled) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Group by day
    const dailyCancellations = new Map<string, number>();
    cancelledBookings?.forEach((booking) => {
      const date = new Date(booking.cancelled_at || booking.scheduled_at).toISOString().split("T")[0];
      dailyCancellations.set(date, (dailyCancellations.get(date) || 0) + 1);
    });

    const dailyBreakdown = Array.from(dailyCancellations.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Enrich recent cancellations with client info (match frontend expected format)
    const recentCancellations = cancelledBookings?.slice(0, 20).map((booking: any) => {
      const clientInfo = booking.customer_id ? clientMap.get(booking.customer_id) : null;
      return {
        ...booking,
        users: clientInfo ? {
          full_name: clientInfo.full_name,
          email: clientInfo.email,
        } : null,
      };
    }) || [];

    return successResponse({
      totalCancelled,
      totalBookings,
      cancellationRate,
      lostRevenue,
      cancellationReasons,
      dailyBreakdown,
      recentCancellations,
    });
  } catch (error) {
    return handleApiError(error, "CANCELLATIONS_ERROR", 500);
  }
}
