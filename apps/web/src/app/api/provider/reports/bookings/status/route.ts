import { NextRequest } from "next/server";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { createClient } from "@supabase/supabase-js";
import { getProviderRevenue } from "@/lib/reports/revenue-helpers";
import { LEDGER_FULL_PROVIDER_NET_TYPES, MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

/** Display order for known lifecycle statuses; unknown DB values sort last alphabetically. */
const STATUS_DISPLAY_ORDER = [
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

function sortStatusKeys(statuses: Iterable<string>): string[] {
  const arr = Array.from(new Set(statuses));
  return arr.sort((a, b) => {
    const ia = STATUS_DISPLAY_ORDER.indexOf(a as (typeof STATUS_DISPLAY_ORDER)[number]);
    const ib = STATUS_DISPLAY_ORDER.indexOf(b as (typeof STATUS_DISPLAY_ORDER)[number]);
    const sa = ia === -1 ? 1000 : ia;
    const sb = ib === -1 ? 1000 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff", "superadmin"], request);

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
    const searchParams = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, reportContext.timezone, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });

    const locationId = searchParams.get("location_id") || null;

    let bookingsQuery = supabaseAdmin
      .from("bookings")
      .select("id, status")
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromDate.toISOString())
      .lte("scheduled_at", toDate.toISOString())
      .order("scheduled_at", { ascending: true });

    if (locationId) {
      bookingsQuery = bookingsQuery.eq("location_id", locationId);
    }

    const { data: bookings, error: bookingsError } = await bookingsQuery;

    if (bookingsError) {
      return handleApiError(new Error("Failed to fetch bookings"), "BOOKINGS_FETCH_ERROR", 500);
    }

    const ledgerOpts = {
      transactionTypes: LEDGER_FULL_PROVIDER_NET_TYPES,
      timezone: reportContext.timezone,
    };

    const { revenueByBooking } = await getProviderRevenue(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId || undefined,
      ledgerOpts,
    );

    const countByStatus = new Map<string, number>();
    const revenueByStatus = new Map<string, number>();

    for (const booking of bookings || []) {
      const rawStatus = (booking as { status?: string }).status ?? "unknown";
      const statusKey = String(rawStatus);
      countByStatus.set(statusKey, (countByStatus.get(statusKey) || 0) + 1);

      const bookingId = (booking as { id: string }).id;
      const bookingRev = revenueByBooking.get(bookingId) || 0;
      revenueByStatus.set(statusKey, (revenueByStatus.get(statusKey) || 0) + bookingRev);
    }

    const totalBookings = bookings?.length ?? 0;

    const completed = countByStatus.get("completed") ?? 0;
    const cancelled = countByStatus.get("cancelled") ?? 0;
    const noShow = countByStatus.get("no_show") ?? 0;

    const completionRate = totalBookings > 0 ? (completed / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (cancelled / totalBookings) * 100 : 0;
    const noShowRate = totalBookings > 0 ? (noShow / totalBookings) * 100 : 0;

    const allKeys = sortStatusKeys([...countByStatus.keys()]);

    const bookingsByStatus = allKeys.map((status) => {
      const count = countByStatus.get(status) ?? 0;
      const pct = totalBookings > 0 ? (count / totalBookings) * 100 : 0;
      return {
        status,
        count,
        percentage: pct,
        revenue: revenueByStatus.get(status) ?? 0,
      };
    });

    const statusBreakdown = Object.fromEntries(countByStatus);

    return successResponse({
      statusBreakdown,
      totalBookings,
      completionRate,
      cancellationRate,
      noShowRate,
      bookingsByStatus,
      ledgerTransactionTypes: [...LEDGER_FULL_PROVIDER_NET_TYPES],
      basisNote:
        "Appointment counts use bookings.scheduled_at in your reporting window (all statuses). Ledger net sums finance_transactions per booking (provider earnings, travel, tips), attributed to the booking’s current status; cash or offline settlements may have no ledger rows. Rows include pending_payment, waiting, and checked_in when present.",
    });
  } catch (error) {
    console.error("Error in booking status report:", error);
    return handleApiError(error, "Failed to generate booking status report");
  }
}
