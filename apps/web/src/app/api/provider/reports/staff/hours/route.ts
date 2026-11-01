import { NextRequest } from "next/server";
import {
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { createClient } from "@supabase/supabase-js";
import { MAX_BOOKINGS_FOR_REPORT, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";
import {
  computeStaffScheduledHoursReport,
  type StaffHoursBooking,
} from "@/lib/reports/staff-scheduled-hours";

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request, { reportType: "staff" });
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);

    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const staffId = searchParams.get("staff_id");
    const locationId = searchParams.get("location_id") || undefined;

    let staffQuery = supabaseAdmin
      .from("provider_staff")
      .select(
        `
        id,
        user_id,
        users (
          full_name
        )
      `,
      )
      .eq("provider_id", providerId)
      .eq("is_active", true);

    if (staffId) {
      staffQuery = staffQuery.eq("id", staffId);
    }

    const { data: staffMembers, error: staffError } = await staffQuery;

    if (staffError) {
      return handleApiError(new Error("Failed to fetch staff"), "STAFF_FETCH_ERROR", 500);
    }

    let bookings: StaffHoursBooking[] = [];
    try {
      bookings = await fetchAllPaged<StaffHoursBooking>(async (from, to) => {
        let bookingsQuery = supabaseAdmin
          .from("bookings")
          .select(
            `
        id,
        scheduled_at,
        status,
        booking_services (
          id,
          staff_id,
          offerings:offering_id (
            duration_minutes
          )
        )
      `,
          )
          .eq("provider_id", providerId)
          .gte("scheduled_at", fromDate.toISOString())
          .lte("scheduled_at", toDate.toISOString())
          .order("scheduled_at", { ascending: true });

        if (locationId) {
          bookingsQuery = bookingsQuery.eq("location_id", locationId);
        }

        const { data, error } = await bookingsQuery.range(from, to);
        return { data, error };
      }, MAX_BOOKINGS_FOR_REPORT);
    } catch (bookingsError) {
      return handleApiError(
        new Error("Failed to fetch bookings"),
        "BOOKINGS_FETCH_ERROR",
        500,
      );
    }

    const payload = computeStaffScheduledHoursReport(staffMembers || [], bookings, {
      bookingsTruncated: bookings.length >= MAX_BOOKINGS_FOR_REPORT,
    });

    return successResponse(payload);
  } catch (error) {
    return handleApiError(error, "STAFF_HOURS_ERROR", 500);
  }
}
