import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { canAccessReportType } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { calculateStaffCommission } from "@/lib/payroll/commission-calculator";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);    // Check subscription allows advanced reports (staff reports are advanced)
    const accessCheck = await canAccessReportType(user.id, "staff");
    if (!accessCheck.allowed) {
      return accessCheck.error!;
    }

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
    const fromDate = searchParams.get("from")
      ? new Date(searchParams.get("from")!)
      : subDays(new Date(), 30);
    const toDate = searchParams.get("to")
      ? new Date(searchParams.get("to")!)
      : new Date();
    const staffId = searchParams.get("staffId");

    // Get all staff members for this provider
    let staffQuery = supabaseAdmin
      .from('provider_staff')
      .select(`
        id,
        user_id,
        users (
          full_name
        )
      `)
      .eq('provider_id', providerId)
      .eq('is_active', true);

    if (staffId) {
      staffQuery = staffQuery.eq('id', staffId);
    }

    const { data: staffMembers, error: staffError } = await staffQuery;

    if (staffError) {
      return handleApiError(
        new Error('Failed to fetch staff members'),
        'STAFF_FETCH_ERROR',
        500
      );
    }

    // Get provider revenue from finance_transactions
    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate
    );

    // Get bookings for date range
    const bookingsQuery = supabaseAdmin
      .from('bookings')
      .select(`
        id,
        status,
        scheduled_at,
        completed_at,
        booking_services (
          id,
          price,
          staff_id,
          actual_start_at,
          actual_end_at
        )
      `)
      .eq('provider_id', providerId)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error('Failed to fetch bookings'),
        'BOOKINGS_FETCH_ERROR',
        500
      );
    }

    // Get reviews for staff members
    // Note: reviews table has staff_rating as JSONB, not staff_id directly
    const { data: reviews } = await supabaseAdmin
      .from('reviews')
      .select('staff_rating, rating, booking_id')
      .eq('provider_id', providerId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    // Calculate performance metrics for each staff member
    const staffPerformance = await Promise.all((staffMembers || []).map(async (staff: any) => {
      const staffBookings = bookings?.filter((booking: any) =>
        booking.booking_services?.some((service: any) => service.staff_id === staff.id)
      ) || [];

      // Filter reviews by staff_rating JSONB field
      // staff_rating format: {staff_id: "...", rating: 5} or null
      const staffReviews = (reviews || []).filter((r: any) => {
        if (!r.staff_rating || typeof r.staff_rating !== 'object') return false;
        return r.staff_rating.staff_id === staff.id;
      }) || [];

      const totalBookings = staffBookings.length;
      const completedBookings = staffBookings.filter((b: any) => b.status === 'completed').length;
      const cancelledBookings = staffBookings.filter((b: any) => b.status === 'cancelled').length;
      const noShows = staffBookings.filter((b: any) => b.status === 'no_show').length;

      // Calculate revenue from finance_transactions, distributed proportionally by service price
      let totalRevenue = 0;
      staffBookings.forEach((booking: any) => {
        const bookingRevenue = revenueByBooking.get(booking.id) || 0;
        if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
          return;
        }
        // Find services assigned to this staff member
        const staffServices = booking.booking_services.filter(
          (service: any) => service.staff_id === staff.id
        );
        if (staffServices.length === 0) return;

        // Calculate total price of all services in booking
        const totalServicePrice = booking.booking_services.reduce(
          (sum: number, s: any) => sum + Number(s.price || 0),
          0
        );
        // Calculate staff's portion of revenue
        const staffServicePrice = staffServices.reduce(
          (sum: number, s: any) => sum + Number(s.price || 0),
          0
        );
        const staffProportion = totalServicePrice > 0 ? staffServicePrice / totalServicePrice : 0;
        totalRevenue += bookingRevenue * staffProportion;
      });

      const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      // Calculate total hours worked
      let totalHours = 0;
      staffBookings.forEach((booking: any) => {
        if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
          return;
        }
        booking.booking_services.forEach((service: any) => {
          if (service.actual_start_at && service.actual_end_at) {
            const start = new Date(service.actual_start_at);
            const end = new Date(service.actual_end_at);
            const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            totalHours += hours;
          }
        });
      });

      // Get rating from staff_rating JSONB field or fallback to main rating
      const averageRating =
        staffReviews.length > 0
          ? staffReviews.reduce((sum: number, r: any) => {
              const staffRating = r.staff_rating?.rating || r.rating || 0;
              return sum + Number(staffRating);
            }, 0) / staffReviews.length
          : 0;

      // Calculate commission using staff-specific rates
      const commissionResult = await calculateStaffCommission(
        supabaseAdmin,
        providerId,
        staff.id,
        fromDate,
        toDate
      );
      const commissionEarned = commissionResult.totalCommission;

      return {
        staffId: staff.id,
        staffName: staff.users?.full_name || 'Unknown',
        totalBookings,
        completedBookings,
        cancelledBookings,
        noShows,
        totalRevenue,
        averageBookingValue,
        totalHours,
        averageRating,
        totalReviews: staffReviews.length,
        commissionEarned,
      };
    }));

    // Calculate summary
    const summary = {
      totalStaff: staffPerformance.length,
      totalBookings: staffPerformance.reduce((sum, s) => sum + s.totalBookings, 0),
      totalRevenue: staffPerformance.reduce((sum, s) => sum + s.totalRevenue, 0),
      averageRating:
        staffPerformance.length > 0
          ? staffPerformance.reduce((sum, s) => sum + s.averageRating, 0) /
            staffPerformance.length
          : 0,
    };

    return successResponse({
      staffMembers: staffPerformance.sort((a, b) => b.totalRevenue - a.totalRevenue),
      summary,
    });
  } catch (error) {
    console.error("Error in staff performance report:", error);
    return handleApiError(error, "Failed to generate staff performance report");
  }
}
