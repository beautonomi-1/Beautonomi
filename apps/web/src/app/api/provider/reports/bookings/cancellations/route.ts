import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  notFoundResponse,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getProviderNetAfterRefundsByBooking } from "@/lib/reports/revenue-helpers";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { RECOGNIZED_REVENUE_TYPES } from "@/lib/reports/provider-revenue-semantics";
import { getProviderReportContext, reportDateKey, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";

const PAGE_SIZE = 1000;
const RECENT_LIMIT = 25;

export type CancellationsReportResponse = {
  totalCancelled: number;
  totalBookings: number;
  cancellationRate: number;
  lostRevenue: number;
  cancellationReasons: Array<{ reason: string; count: number; percentage: number }>;
  dailyBreakdown: Array<{ date: string; count: number }>;
  recentCancellations: Array<Record<string, unknown>>;
  reportBasis: string;
  basisNote: string;
  ledgerTransactionTypes: string[];
  timezone: string;
};

type LightCancelRow = {
  id: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  scheduled_at: string | null;
};

async function fetchAllCancelledLight(
  supabaseAdmin: SupabaseClient,
  params: {
    providerId: string;
    fromIso: string;
    toIso: string;
    locationId?: string;
  },
): Promise<LightCancelRow[]> {
  const out: LightCancelRow[] = [];
  let offset = 0;
  for (;;) {
    let q = supabaseAdmin
      .from("bookings")
      .select("id, cancellation_reason, cancelled_at, scheduled_at")
      .eq("provider_id", params.providerId)
      .eq("status", "cancelled")
      .gte("scheduled_at", params.fromIso)
      .lte("scheduled_at", params.toIso)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (params.locationId) q = q.eq("location_id", params.locationId);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data ?? []) as LightCancelRow[];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;

    const supabaseAdmin = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, tz, {
      defaultDays: 30,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    const lightRows = await fetchAllCancelledLight(supabaseAdmin, {
      providerId,
      fromIso,
      toIso,
      locationId,
    });

    let allBookingsCountQuery = supabaseAdmin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso);

    if (locationId) {
      allBookingsCountQuery = allBookingsCountQuery.eq("location_id", locationId);
    }

    const { count: allBookingsCount } = await allBookingsCountQuery;

    const totalBookings = allBookingsCount ?? 0;
    const totalCancelled = lightRows.length;
    const cancellationRate = totalBookings > 0 ? Math.round((totalCancelled / totalBookings) * 1000) / 10 : 0;

    const cancelledIds = lightRows.map((r) => r.id);

    const netByBooking =
      cancelledIds.length > 0
        ? await getProviderNetAfterRefundsByBooking(
            supabaseAdmin,
            providerId,
            fromDate,
            toDate,
            locationId ?? null,
            { bookingIds: cancelledIds },
          )
        : new Map<string, number>();

    let lostRevenue = 0;
    for (const bookingId of cancelledIds) {
      lostRevenue += netByBooking.get(bookingId) || 0;
    }

    const reasonMap = new Map<string, number>();
    for (const booking of lightRows) {
      const rawReason = booking.cancellation_reason;
      const reason =
        rawReason == null || String(rawReason).trim() === "" ? "No reason provided" : String(rawReason).trim();
      reasonMap.set(reason, (reasonMap.get(reason) || 0) + 1);
    }

    const cancellationReasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: totalCancelled > 0 ? Math.round((count / totalCancelled) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const dailyCancellations = new Map<string, number>();
    for (const booking of lightRows) {
      const anchor = booking.cancelled_at || booking.scheduled_at;
      const date = anchor ? reportDateKey(new Date(anchor), tz) : reportDateKey(fromDate, tz);
      dailyCancellations.set(date, (dailyCancellations.get(date) || 0) + 1);
    }

    const dailyBreakdown = Array.from(dailyCancellations.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const clientIds = new Set<string>();
    let recentQuery = supabaseAdmin
      .from("bookings")
      .select(
        `
        id,
        total_amount,
        scheduled_at,
        cancelled_at,
        cancellation_reason,
        customer_id
      `,
      )
      .eq("provider_id", providerId)
      .eq("status", "cancelled")
      .gte("scheduled_at", fromIso)
      .lte("scheduled_at", toIso)
      .order("cancelled_at", { ascending: false })
      .limit(RECENT_LIMIT);

    if (locationId) {
      recentQuery = recentQuery.eq("location_id", locationId);
    }

    const { data: recentRows, error: recentErr } = await recentQuery;
    if (recentErr) throw recentErr;

    const recentBookings = (recentRows ?? []) as Array<{
      id: string;
      total_amount?: number;
      scheduled_at?: string;
      cancelled_at?: string | null;
      cancellation_reason?: string | null;
      customer_id?: string | null;
    }>;

    recentBookings.forEach((b) => {
      if (b.customer_id) clientIds.add(b.customer_id);
    });

    const clientMap = new Map<string, { full_name: string; email: string }>();
    if (clientIds.size > 0) {
      const { data: clients, error: clientError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, email")
        .in("id", Array.from(clientIds));

      if (!clientError) {
        clients?.forEach((client: { id: string; full_name?: string; email?: string }) => {
          clientMap.set(client.id, {
            full_name: client.full_name || "Unknown",
            email: client.email || "",
          });
        });
      }
    }

    const recentCancellations = recentBookings.map((booking) => {
      const clientInfo = booking.customer_id ? clientMap.get(booking.customer_id) : null;
      return {
        ...booking,
        users: clientInfo
          ? {
              full_name: clientInfo.full_name,
              email: clientInfo.email,
            }
          : null,
      };
    });

    const reportBasis =
      "Cancellation rate = cancelled appointments ÷ all appointments, both filtered by scheduled date in your window. Net impact sums recognized ledger revenue (incl. retained cancellation fees) minus refund clawbacks for those cancellations.";

    const basisNote = [
      `Timezone for chart dates: ${tz}.`,
      `Denominator (total bookings) and numerator (cancelled count) both use bookings.scheduled_at within the reporting window (all statuses included in the denominator).`,
      `Reason mix and daily counts include every cancelled booking in that scheduled window — not a sample.`,
      `Daily breakdown buckets each cancellation by provider-local calendar day of cancelled_at when set; otherwise scheduled_at (same-day fallback when cancel timestamp missing).`,
      `Net impact sums recognized provider revenue net of refund clawbacks per cancelled booking_id, where transactions have created_at in the reporting window and types: ${RECOGNIZED_REVENUE_TYPES.join(", ")} plus refund rows. Retained cancellation_fee is included; reversed service earnings reduce the total.`,
      `Recent cancellations lists up to ${RECENT_LIMIT} rows ordered by cancelled_at (newest first).`,
    ].join(" ");

    return successResponse({
      totalCancelled,
      totalBookings,
      cancellationRate,
      lostRevenue,
      cancellationReasons,
      dailyBreakdown,
      recentCancellations,
      reportBasis,
      basisNote,
      ledgerTransactionTypes: [...RECOGNIZED_REVENUE_TYPES, "refund"],
      timezone: tz,
    } satisfies CancellationsReportResponse);
  } catch (error) {
    return handleApiError(error, "CANCELLATIONS_ERROR", 500);
  }
}
