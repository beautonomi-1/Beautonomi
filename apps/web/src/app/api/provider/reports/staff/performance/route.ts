import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { canAccessReportType } from "@/lib/subscriptions/report-gating";
import { createClient } from "@supabase/supabase-js";
import { LEDGER_FULL_PROVIDER_NET_TYPES, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { allocateLedgerNetByStaff } from "@/lib/reports/staff-ledger-revenue";
import { calculateStaffCommission } from "@/lib/payroll/commission-calculator";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;    // Check subscription allows advanced reports (staff reports are advanced)
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

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const staffId = searchParams.get("staffId");
    const locationId = searchParams.get("location_id") || undefined;

    // Get all staff members for this provider
    let staffQuery = supabaseAdmin
      .from('provider_staff')
      .select(`
        id,
        user_id,
        commission_enabled,
        tips_enabled,
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

    const { revenueByBooking } = await getProviderRevenue(supabaseAdmin, providerId, fromDate, toDate, locationId ?? null, {
      transactionTypes: LEDGER_FULL_PROVIDER_NET_TYPES,
      timezone: reportContext.timezone,
    });

    // Get bookings for date range
    let bookingsQuery = supabaseAdmin
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

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(
        new Error('Failed to fetch bookings'),
        'BOOKINGS_FETCH_ERROR',
        500
      );
    }

    const ledgerNetByStaff = allocateLedgerNetByStaff(revenueByBooking, bookings || []);

    // Get reviews for staff members
    // Note: reviews table has staff_rating as JSONB, not staff_id directly
    const { data: reviews } = await supabaseAdmin
      .from('reviews')
      .select('staff_rating, rating, booking_id')
      .eq('provider_id', providerId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString());

    const bookingIdSet = new Set((bookings || []).map((b: { id: string }) => b.id));

    // Calculate performance metrics for each staff member
    const staffPerformance = await Promise.all((staffMembers || []).map(async (staff: any) => {
      const staffBookings = bookings?.filter((booking: any) =>
        booking.booking_services?.some((service: any) => service.staff_id === staff.id)
      ) || [];

      // Filter reviews by staff_rating JSONB field (scoped to bookings in this report, e.g. location)
      // staff_rating format: {staff_id: "...", rating: 5} or null
      const staffReviews = (reviews || []).filter((r: any) => {
        if (r.booking_id && !bookingIdSet.has(r.booking_id)) return false;
        if (!r.staff_rating || typeof r.staff_rating !== 'object') return false;
        return r.staff_rating.staff_id === staff.id;
      }) || [];

      const totalBookings = staffBookings.length;
      const completedBookings = staffBookings.filter((b: any) => b.status === 'completed').length;
      const cancelledBookings = staffBookings.filter((b: any) => b.status === 'cancelled').length;
      const noShows = staffBookings.filter((b: any) => b.status === 'no_show').length;

      const totalRevenue = ledgerNetByStaff.get(staff.id) ?? 0;

      const averageBookingValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      // Calculate total hours worked — only count service lines assigned to THIS staff
      let totalHours = 0;
      staffBookings.forEach((booking: any) => {
        if (!booking.booking_services || !Array.isArray(booking.booking_services)) {
          return;
        }
        booking.booking_services.forEach((service: any) => {
          if (service.staff_id !== staff.id) return;
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

      const commissionEnabled = staff.commission_enabled !== false;
      let commissionEarned = 0;
      if (commissionEnabled) {
        const commissionResult = await calculateStaffCommission(
          supabaseAdmin,
          providerId,
          staff.id,
          fromDate,
          toDate,
          locationId
        );
        commissionEarned = commissionResult.totalCommission;
      }

      return {
        staffId: staff.id,
        staffName: staff.users?.full_name || 'Unknown',
        commissionEnabled,
        tipsEnabled: staff.tips_enabled === true,
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

    const uniqueAppointmentIds = new Set((bookings || []).map((b: { id: string }) => b.id));
    const uniqueAppointments = uniqueAppointmentIds.size;
    const assignmentTouches = staffPerformance.reduce((sum, s) => sum + s.totalBookings, 0);

    const totalReviewsWeighted = staffPerformance.reduce((sum, s) => sum + s.totalReviews, 0);
    const averageRatingWeighted =
      totalReviewsWeighted > 0
        ? staffPerformance.reduce((sum, s) => sum + s.averageRating * s.totalReviews, 0) /
          totalReviewsWeighted
        : 0;

    const summary = {
      totalStaff: staffPerformance.length,
      /** Distinct appointments in range (each booking counted once). */
      uniqueAppointments,
      /**
       * Sum of per-staff booking counts — exceeds unique appointments when
       * multiple staff share an appointment.
       */
      staffAssignmentTouches: assignmentTouches,
      totalRevenue: staffPerformance.reduce((sum, s) => sum + s.totalRevenue, 0),
      averageRating: averageRatingWeighted,
    };

    return successResponse({
      staffMembers: staffPerformance.sort((a, b) => b.totalRevenue - a.totalRevenue),
      summary,
      ledgerTransactionTypes: [...LEDGER_FULL_PROVIDER_NET_TYPES],
      basisNote:
        "Ledger net uses finance_transactions (provider_earnings, travel_fee, tip) split by line price share. Commission uses provider_earnings only (payroll rules). Average rating is weighted by review count. Unique appointments avoids double-counting shared bookings in the summary.",
    });
  } catch (error) {
    console.error("Error in staff performance report:", error);
    return handleApiError(error, "Failed to generate staff performance report");
  }
}
