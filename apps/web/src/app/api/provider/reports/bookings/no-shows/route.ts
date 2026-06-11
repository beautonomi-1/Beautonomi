import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderNetAfterRefundsByBooking } from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";
import { RECOGNIZED_REVENUE_TYPES } from "@/lib/reports/provider-revenue-semantics";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

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

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    // Get no-show bookings (simplified query to avoid deep nesting)
    let noShowBookingsQuery = supabaseAdmin
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

    if (locationId) {
      noShowBookingsQuery = noShowBookingsQuery.eq("location_id", locationId);
    }

    const { data: noShowBookings, error: bookingsError } = await noShowBookingsQuery;

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

    // Get exact counts for no-show rate. The recent no-show list above is capped
    // for payload size, but headline rates must not be capped.
    let allBookingsCountQuery = supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    let noShowCountQuery = supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "no_show")
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());

    if (locationId) {
      allBookingsCountQuery = allBookingsCountQuery.eq("location_id", locationId);
      noShowCountQuery = noShowCountQuery.eq("location_id", locationId);
    }

    const [{ count: allBookingsCount }, { count: noShowCount }] = await Promise.all([
      allBookingsCountQuery,
      noShowCountQuery,
    ]);

    const totalBookings = allBookingsCount || 0;
    const totalNoShows = noShowCount || 0;
    const noShowRate = totalBookings > 0 ? (totalNoShows / totalBookings) * 100 : 0;
    
    const noShowBookingIds = noShowBookings?.map((b) => b.id) || [];
    let lostRevenue = 0;

    const noShowLedgerByBooking =
      noShowBookingIds.length > 0
        ? await getProviderNetAfterRefundsByBooking(
            supabaseAdmin,
            providerId,
            fromDate,
            toDate,
            locationId ?? null,
            { bookingIds: noShowBookingIds },
          )
        : new Map<string, number>();

    for (const bookingId of noShowBookingIds) {
      lostRevenue += noShowLedgerByBooking.get(bookingId) || 0;
    }

    // Group by client (repeat offenders)
    const repeatOffenderMap = new Map<
      string,
      { name: string; email: string; count: number; booked_value: number; ledger_earnings: number }
    >();
    noShowBookings?.forEach((booking) => {
      const clientId = booking.customer_id;
      if (clientId) {
        const clientInfo = clientMap.get(clientId) || { full_name: "Unknown", email: "" };
        const existing = repeatOffenderMap.get(clientId) || {
          name: clientInfo.full_name,
          email: clientInfo.email,
          count: 0,
          booked_value: 0,
          ledger_earnings: 0,
        };
        existing.count += 1;
        existing.booked_value += Number(booking.total_amount || 0);
        existing.ledger_earnings += noShowLedgerByBooking.get(booking.id) || 0;
        repeatOffenderMap.set(clientId, existing);
      }
    });

    const repeatOffenders = Array.from(repeatOffenderMap.values())
      .filter((c) => c.count > 1)
      .sort((a, b) => b.count - a.count)
      .map((c) => ({
        ...c,
        /** @deprecated Use booked_value — booked appointment total. */
        revenue: c.booked_value,
      }));

    // Group by staff — count distinct bookings per staff (not raw service lines)
    const staffBreakdownMap = new Map<string, { name: string; count: number }>();
    noShowBookings?.forEach((booking) => {
      const seenStaff = new Set<string>();
      booking.booking_services?.forEach((bs: any) => {
        if (bs.staff_id && !seenStaff.has(bs.staff_id)) {
          seenStaff.add(bs.staff_id);
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
      /** Net recognized revenue for no-show bookings (incl. retained no-show/cancellation fees, net of refunds). */
      ledgerNetRecognized: lostRevenue,
      /** @deprecated Use ledgerNetRecognized — same value; name was misleading vs booked loss. */
      lostRevenue,
      repeatOffenders,
      staffBreakdown,
      recentNoShows: noShowBookings?.slice(0, 20) || [],
      basisNote:
        "ledgerNetRecognized sums net provider_earnings + tip + travel_fee ledger rows for no-show bookings in range (often zero when never paid). booked_value on repeat offenders uses appointment total_amount.",
      reportBasis:
        "No-show rate uses exact booking counts for the selected scheduled-date range. Recent no-shows and staff/client breakdowns are capped for display.",
    });
  } catch (error) {
    return handleApiError(error, "NO_SHOWS_ERROR", 500);
  }
}
