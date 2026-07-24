import { NextRequest } from "next/server";
import {  requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError  } from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import {
  getProviderNetAfterRefundsDetailed,
  getPreviousPeriodNetAfterRefunds,
} from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { RECOGNIZED_REVENUE_TYPES } from "@/lib/reports/provider-revenue-semantics";
import { getProviderReportContext, reportDateRangeFromParams, reportDateKey } from "@/lib/reports/provider-report-utils";
import { getRecordedTakingsForRange } from "@/lib/reports/recorded-takings";

export async function GET(request: NextRequest) {
  try {
    // Require provider_owner or provider_staff role
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;    // Use service role client for all queries to avoid RLS infinite recursion
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

    const netOpts = { timezone: reportContext.timezone };

    const {
      totalRevenue,
      revenueByBooking,
      revenueByProductOrder,
      revenueByDate,
    } = await getProviderNetAfterRefundsDetailed(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
      netOpts,
    );

    let appointmentLedgerRevenue = 0;
    revenueByBooking.forEach((v) => {
      appointmentLedgerRevenue += v;
    });
    let retailLedgerRevenue = 0;
    revenueByProductOrder.forEach((v) => {
      retailLedgerRevenue += v;
    });

    const totalBookings = bookings?.length || 0;
    const bookingsWithLedgerActivity = [...revenueByBooking.entries()].filter(([, v]) => v > 0).length;
    const retailOrderCount = revenueByProductOrder.size;
    /** Average net ledger amount per appointment that has any recognized ledger activity in range. */
    const averageBookingValue =
      bookingsWithLedgerActivity > 0 ? appointmentLedgerRevenue / bookingsWithLedgerActivity : 0;

    // Get previous period for comparison
    const prevRevenue = await getPreviousPeriodNetAfterRefunds(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
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

    let revenueByService = Array.from(revenueByServiceMap.entries())
      .map(([serviceName, data]) => ({
        serviceName,
        revenue: data.revenue,
        bookings: data.bookingIds.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    if (retailLedgerRevenue > 0) {
      revenueByService = [
        ...revenueByService,
        {
          serviceName: "Retail & product orders (ledger)",
          revenue: retailLedgerRevenue,
          bookings: retailOrderCount,
        },
      ].sort((a, b) => b.revenue - a.revenue);
    }

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

    const recorded = await getRecordedTakingsForRange(supabaseAdmin, {
      providerId,
      rangeStartIso: fromDate.toISOString(),
      rangeEndIso: toDate.toISOString(),
      locationId: locationId || undefined,
    });

    return successResponse({
      totalRevenue,
      appointmentLedgerRevenue,
      retailLedgerRevenue,
      retailOrderCount,
      totalBookings,
      bookingsWithLedgerActivity,
      averageBookingValue,
      revenueGrowth,
      bookingsGrowth,
      revenueByDay,
      revenueByService,
      revenueByStaff,
      ledgerTransactionTypes: [...RECOGNIZED_REVENUE_TYPES, "refund"],
      recordedTakings: {
        total: recorded.totalRecorded,
        byPaymentMethod: recorded.byPaymentMethod,
        bookingPaymentsTotal: recorded.bookingPaymentsTotal,
        walletTotal: recorded.walletTotal,
        retailAndLegacySalesTotal: recorded.salesTotal,
        tipsTotal: recorded.tipsTotal,
        cancellationFeesTotal: recorded.cancellationFeesTotal,
        bookingCount: recorded.bookingCount,
        salesCount: recorded.salesCount,
        locationAttribution: recorded.locationAttribution,
      },
      recordedTakingsBasisNote:
        "Recorded takings sum what was logged in-app: completed booking_payments (by payment date), wallet amounts on appointments scheduled in range, completed legacy sales and walk-in product orders (by sale/paid date), plus ledger tips and cancellation fees in range. This is cash-register style and can differ from ledger net when cash or terminal payments never settled through the platform.",
      basisNote:
        "Totals use finance_transactions net amounts (recognized when recorded). Includes provider earnings, travel fees, and tips for appointments; plus retail/product orders settled through the platform. Scheduled appointment counts use service dates (all statuses). Revenue-by-day uses ledger dates; per-day booking counts use appointment dates — they will not always match. Service/staff splits allocate each booking’s ledger net by line-item price share (variants use each line’s offering title). Compare recorded takings for salon-logged cash and terminal amounts.",
    });
  } catch (error) {
    console.error("Error in sales summary report:", error);
    return handleApiError(error, "Failed to generate sales summary report");
  }
}
