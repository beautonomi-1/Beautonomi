import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { DASHBOARD_REVENUE_TRANSACTION_TYPES, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams, reportDateKey } from "@/lib/reports/provider-report-utils";

export async function GET(request: NextRequest) {
  try {
    // Require provider_owner or provider_staff role
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    // Use service role client for all queries to avoid RLS infinite recursion
    const supabaseAdmin = createClient(
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
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);


    // Get date range from query params
    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get("location_id");
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });

    // Get bookings in date range (simplified query to avoid nested join issues)
    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        scheduled_at,
        status,
        location_id,
        booking_services (
          id,
          price,
          offering_id,
          staff_id,
          offerings:offering_id (
            title
          )
        )
      `
      )
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString());
    
    // Filter by location if provided
    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }
    
    const { data: bookings, error: bookingsError } = await bookingsQuery
      .order("scheduled_at", { ascending: false });

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      return handleApiError(
        new Error(`Failed to fetch bookings: ${bookingsError.message}`),
        "BOOKINGS_FETCH_ERROR",
        500
      );
    }

    // Get staff information separately to avoid deep nesting issues
    const staffIds = new Set<string>();
    bookings?.forEach((booking: { booking_services?: Array<{ staff_id?: string }> }) => {
      booking.booking_services?.forEach((service: { staff_id?: string }) => {
        if (service.staff_id) {
          staffIds.add(service.staff_id);
        }
      });
    });

    const staffMap = new Map<string, string>();
    if (staffIds.size > 0) {
      const { data: staffMembers, error: staffError } = await supabaseAdmin
        .from("provider_staff")
        .select("id, user_id, users(full_name)")
        .in("id", Array.from(staffIds));

      if (staffError) {
        console.warn("Error fetching staff information:", staffError);
        // Continue without staff names - will default to "Unassigned"
      } else {
        staffMembers?.forEach((staff: { id: string; users?: Array<{ full_name?: string }> | { full_name?: string } }) => {
          const staffName = (Array.isArray(staff.users) ? staff.users[0]?.full_name : staff.users?.full_name) || "Unassigned";
          staffMap.set(staff.id, staffName);
        });
      }
    }

    const dashOpts = { transactionTypes: DASHBOARD_REVENUE_TRANSACTION_TYPES, timezone: reportContext.timezone };

    // Get provider revenue — same net as main dashboard revenue cards
    const { totalRevenue, revenueByBooking, revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
      dashOpts
    );

    const totalBookings = bookings?.length || 0;
    const bookingsWithLedgerRevenue = [...revenueByBooking.values()].filter((v) => v > 0).length;
    const averageBookingValue =
      bookingsWithLedgerRevenue > 0 ? totalRevenue / bookingsWithLedgerRevenue : 0;

    // Get previous period for comparison
    const prevRevenue = await getPreviousPeriodRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
      dashOpts
    );

    const periodDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const prevFromDate = subDays(fromDate, periodDays);
    const prevToDate = fromDate;

    let prevBookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", prevFromDate.toISOString())
      .lte("scheduled_at", prevToDate.toISOString());

    if (locationId) {
      prevBookingsQuery = prevBookingsQuery.eq("location_id", locationId);
    }

    const { data: prevBookings } = await prevBookingsQuery;

    const prevBookingsCount = prevBookings?.length || 0;

    const revenueGrowth =
      prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const bookingsGrowth =
      prevBookingsCount > 0
        ? ((totalBookings - prevBookingsCount) / prevBookingsCount) * 100
        : 0;

    // Revenue by day (from finance_transactions)
    const revenueByDay = Array.from(revenueByDate.entries())
      .map(([date, revenue]) => {
        // Count bookings for this date
        const bookingsForDate = bookings?.filter(
          (b) => reportDateKey(new Date(b.scheduled_at), reportContext.timezone) === date
        ).length || 0;
        return { date, revenue, bookings: bookingsForDate };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by service (use booking revenue from finance_transactions)
    const revenueByServiceMap = new Map<
      string,
      { revenue: number; bookingIds: Set<string> }
    >();
    // Safely process bookings - use finance_transactions revenue per booking
    (bookings || []).forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
        return;
      }
      // Distribute booking revenue proportionally across services
      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: { price?: number }) => sum + Number(s.price || 0),
        0
      );
      booking.booking_services.forEach((service: { price?: number; offerings?: { title?: string } | Array<{ title?: string }>; staff_id?: string }) => {
        const serviceName = (Array.isArray(service.offerings) ? service.offerings[0]?.title : service.offerings?.title) || "Unknown Service";
        const serviceProportion =
          totalServicePrice > 0
            ? Number(service.price || 0) / totalServicePrice
            : 1 / booking.booking_services.length;
        const serviceRevenue = bookingRevenue * serviceProportion;
        const existing = revenueByServiceMap.get(serviceName) || {
          revenue: 0,
          bookingIds: new Set<string>(),
        };
        existing.revenue += serviceRevenue;
        existing.bookingIds.add(booking.id);
        revenueByServiceMap.set(serviceName, existing);
      });
    });

    const revenueByService = Array.from(revenueByServiceMap.entries())
      .map(([serviceName, data]) => ({
        serviceName,
        revenue: data.revenue,
        bookings: data.bookingIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Revenue by staff (use booking revenue from finance_transactions)
    const revenueByStaffMap = new Map<
      string,
      { revenue: number; bookingIds: Set<string> }
    >();
    // Safely process bookings for staff revenue
    (bookings || []).forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
        return;
      }
      // Distribute booking revenue proportionally across services/staff
      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: { price?: number }) => sum + Number(s.price || 0),
        0
      );
      booking.booking_services.forEach((service: { price?: number; staff_id?: string }) => {
        const staffName = service.staff_id 
          ? (staffMap.get(service.staff_id) || "Unassigned")
          : "Unassigned";
        const serviceProportion =
          totalServicePrice > 0
            ? Number(service.price || 0) / totalServicePrice
            : 1 / booking.booking_services.length;
        const staffRevenue = bookingRevenue * serviceProportion;
        const existing = revenueByStaffMap.get(staffName) || {
          revenue: 0,
          bookingIds: new Set<string>(),
        };
        existing.revenue += staffRevenue;
        existing.bookingIds.add(booking.id);
        revenueByStaffMap.set(staffName, existing);
      });
    });

    const revenueByStaff = Array.from(revenueByStaffMap.entries())
      .map(([staffName, data]) => ({
        staffName,
        revenue: data.revenue,
        bookings: data.bookingIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return successResponse({
      totalRevenue,
      totalBookings,
      averageBookingValue,
      revenueGrowth,
      bookingsGrowth,
      revenueByDay,
      revenueByService,
      revenueByStaff,
    });
  } catch (error) {
    console.error("Error in sales summary report:", error);
    return handleApiError(error, "Failed to generate sales summary report");
  }
}
