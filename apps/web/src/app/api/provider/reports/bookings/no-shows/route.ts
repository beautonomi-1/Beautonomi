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

    // Get no-show bookings (simplified query to avoid deep nesting)
    const { data: noShowBookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        customer_id,
        booking_services (
          id,
          staff_id
        )
      `
      )
      .eq("provider_id", providerId)
      .eq("status", "no_show")
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: false })
      .limit(MAX_BOOKINGS_FOR_REPORT);

    if (bookingsError) {
      console.error("Error fetching no-show bookings:", bookingsError);
      return handleApiError(
        new Error(`Failed to fetch no-show bookings: ${bookingsError.message}`),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get client information separately
    const clientIds = new Set<string>();
    noShowBookings?.forEach((booking: any) => {
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

    // Get staff information separately
    const staffIds = new Set<string>();
    noShowBookings?.forEach((booking: any) => {
      booking.booking_services?.forEach((bs: any) => {
        if (bs.staff_id) {
          staffIds.add(bs.staff_id);
        }
      });
    });

    const staffNameMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staffMembers, error: staffError } = await supabaseAdmin
        .from("provider_staff")
        .select("id, user_id, users(full_name)")
        .in("id", Array.from(staffIds));

      if (staffError) {
        console.warn("Error fetching staff:", staffError);
      } else {
        staffMembers?.forEach((staff: any) => {
          const staffName = staff.users?.full_name || "Unknown";
          staffNameMap.set(staff.id, staffName);
        });
      }
    }

    // Get total bookings for no-show rate (capped for performance)
    const { data: allBookings } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .limit(MAX_BOOKINGS_FOR_REPORT);

    const totalBookings = allBookings?.length || 0;
    const totalNoShows = noShowBookings?.length || 0;
    const noShowRate = totalBookings > 0 ? (totalNoShows / totalBookings) * 100 : 0;
    
    // Calculate lost revenue from finance_transactions (what provider would have earned)
    const noShowBookingIds = noShowBookings?.map((b) => b.id) || [];
    let lostRevenue = 0;
    if (noShowBookingIds.length > 0) {
      const { revenueByBooking } = await getProviderRevenue(
        supabaseAdmin,
        providerId,
        fromDate,
        toDate
      );
      // Sum revenue for no-show bookings (if they had finance_transactions)
      noShowBookingIds.forEach((bookingId) => {
        lostRevenue += revenueByBooking.get(bookingId) || 0;
      });
    }

    // Group by client (repeat offenders)
    const repeatOffenderMap = new Map<string, { name: string; email: string; count: number; revenue: number }>();
    noShowBookings?.forEach((booking) => {
      const clientId = booking.customer_id;
      if (clientId) {
        const clientInfo = clientMap.get(clientId) || { full_name: "Unknown", email: "" };
        const existing = repeatOffenderMap.get(clientId) || {
          name: clientInfo.full_name,
          email: clientInfo.email,
          count: 0,
          revenue: 0,
        };
        existing.count += 1;
        // Note: For client-level analysis, we could use finance_transactions here too
        // but for now keeping total_amount for client perspective
        existing.revenue += Number(booking.total_amount || 0);
        repeatOffenderMap.set(clientId, existing);
      }
    });

    const repeatOffenders = Array.from(repeatOffenderMap.values())
      .filter((c) => c.count > 1)
      .sort((a, b) => b.count - a.count);

    // Group by staff
    const staffBreakdownMap = new Map<string, { name: string; count: number }>();
    noShowBookings?.forEach((booking) => {
      booking.booking_services?.forEach((bs: any) => {
        if (bs.staff_id) {
          const staffName = staffNameMap.get(bs.staff_id) || "Unknown";
          const existing = staffBreakdownMap.get(bs.staff_id) || { name: staffName, count: 0 };
          existing.count += 1;
          staffBreakdownMap.set(bs.staff_id, existing);
        }
      });
    });

    const staffBreakdown = Array.from(staffBreakdownMap.values())
      .sort((a, b) => b.count - a.count);

    return successResponse({
      totalNoShows,
      totalBookings,
      noShowRate,
      lostRevenue,
      repeatOffenders,
      staffBreakdown,
      recentNoShows: noShowBookings?.slice(0, 20) || [],
    });
  } catch (error) {
    return handleApiError(error, "NO_SHOWS_ERROR", 500);
  }
}
