import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue, getPreviousPeriodRevenue } from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS, MAX_BOOKINGS_FOR_REPORT } from "@/lib/reports/constants";

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


    // Get provider ID for user
    const { data: providerData, error: providerError } = await supabaseAdmin
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (providerError) {
      console.error('Error fetching provider:', providerError);
      return handleApiError(
        new Error(`Failed to fetch provider: ${providerError.message}`),
        'PROVIDER_FETCH_ERROR',
        500
      );
    }

    if (!providerData || !providerId) {
      return handleApiError(
        new Error('Provider profile not found. Please complete onboarding first.'),
        'NOT_FOUND',
        404
      );
    }
    // Get date range from query params
    const searchParams = request.nextUrl.searchParams;
    const locationId = searchParams.get("location_id");
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
      .order("scheduled_at", { ascending: false })
      .limit(MAX_BOOKINGS_FOR_REPORT);

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
    bookings?.forEach((booking: any) => {
      booking.booking_services?.forEach((service: any) => {
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
        staffMembers?.forEach((staff: any) => {
          const staffName = staff.users?.full_name || "Unassigned";
          staffMap.set(staff.id, staffName);
        });
      }
    }

    // Get provider revenue from finance_transactions (actual earnings)
    const { totalRevenue, revenueByBooking, revenueByDate } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined
    );

    const totalBookings = bookings?.length || 0;
    const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Get previous period for comparison
    const prevRevenue = await getPreviousPeriodRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined
    );

    const periodDays = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const prevFromDate = subDays(fromDate, periodDays);
    const prevToDate = fromDate;

    const { data: prevBookings } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("provider_id", providerId)
      .gte("scheduled_at", prevFromDate.toISOString())
      .lte("scheduled_at", prevToDate.toISOString());

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
          (b) => new Date(b.scheduled_at).toISOString().split("T")[0] === date
        ).length || 0;
        return { date, revenue, bookings: bookingsForDate };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Revenue by service (use booking revenue from finance_transactions)
    const revenueByServiceMap = new Map<
      string,
      { revenue: number; bookings: number }
    >();
    // Safely process bookings - use finance_transactions revenue per booking
    (bookings || []).forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
        return;
      }
      // Distribute booking revenue proportionally across services
      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: any) => sum + Number(s.price || 0),
        0
      );
      booking.booking_services.forEach((service: any) => {
        const serviceName = service.offerings?.title || "Unknown Service";
        const serviceProportion =
          totalServicePrice > 0
            ? Number(service.price || 0) / totalServicePrice
            : 1 / booking.booking_services.length;
        const serviceRevenue = bookingRevenue * serviceProportion;
        const existing = revenueByServiceMap.get(serviceName) || {
          revenue: 0,
          bookings: 0,
        };
        revenueByServiceMap.set(serviceName, {
          revenue: existing.revenue + serviceRevenue,
          bookings: existing.bookings + 1,
        });
      });
    });

    const revenueByService = Array.from(revenueByServiceMap.entries())
      .map(([serviceName, data]) => ({ serviceName, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    // Revenue by staff (use booking revenue from finance_transactions)
    const revenueByStaffMap = new Map<
      string,
      { revenue: number; bookings: number }
    >();
    // Safely process bookings for staff revenue
    (bookings || []).forEach((booking) => {
      const bookingRevenue = revenueByBooking.get(booking.id) || 0;
      if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
        return;
      }
      // Distribute booking revenue proportionally across services/staff
      const totalServicePrice = booking.booking_services.reduce(
        (sum: number, s: any) => sum + Number(s.price || 0),
        0
      );
      booking.booking_services.forEach((service: any) => {
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
          bookings: 0,
        };
        revenueByStaffMap.set(staffName, {
          revenue: existing.revenue + staffRevenue,
          bookings: existing.bookings + 1,
        });
      });
    });

    const revenueByStaff = Array.from(revenueByStaffMap.entries())
      .map(([staffName, data]) => ({ staffName, ...data }))
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
