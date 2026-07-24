import { NextRequest } from "next/server";
import { differenceInCalendarDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireRoleInApi,
  getProviderIdForUser,
  successResponse,
  notFoundResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { requireProviderReportsAccess } from "@/lib/reports/require-provider-reports-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { MAX_REPORT_DAYS } from "@/lib/reports/constants";
import { getProviderReportContext, reportDateRangeFromParams } from "@/lib/reports/provider-report-utils";
import { sumLedgerEarningsByCustomer } from "@/lib/reports/client-ledger-metrics";

const PAGE_SIZE = 1000;
const REVIEW_IN_CHUNK = 500;

export type ClientSummaryTopClient = {
  clientId: string;
  clientName: string;
  totalBookings: number;
  /** Sum of booking.total_amount in window (booked gross). */
  totalSpent: number;
  ledgerEarnings: number;
  lastVisit: string;
  averageRating: number;
};

export type ClientSummaryResponse = {
  totalClients: number;
  /** Customers whose first-ever booking (in this provider / location scope) falls in the reporting window. */
  newClients: number;
  /** Customers with more than one booking scheduled in the reporting window. */
  returningClients: number;
  /** Mean booked gross per client in window (booking.total_amount). */
  averageLifetimeValue: number;
  averageBookedGross: number;
  averageLedgerEarnings: number;
  averageBookingsPerClient: number;
  topClients: ClientSummaryTopClient[];
  clientRetention: {
    period: string;
    inclusiveDayCount: number;
    retentionRate: number;
  };
  basisNote: string;
  reportBasis: string;
  timezone: string;
};

type BookingRow = {
  id: string;
  customer_id: string | null;
  scheduled_at: string;
  total_amount: number | null;
  status: string;
};

async function fetchAllBookingsForScope(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  locationId: string | undefined,
): Promise<BookingRow[]> {
  const out: BookingRow[] = [];
  let offset = 0;
  for (;;) {
    let q = supabaseAdmin
      .from("bookings")
      .select("id, customer_id, scheduled_at, total_amount, status")
      .eq("provider_id", providerId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (locationId) q = q.eq("location_id", locationId);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data ?? []) as BookingRow[];
    out.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

function inScheduledWindow(scheduledAt: string, fromIso: string, toIso: string): boolean {
  return scheduledAt >= fromIso && scheduledAt <= toIso;
}

export async function GET(request: NextRequest) {
  try {
    const permissionCheck = await requireProviderReportsAccess(request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabaseAdmin = getSupabaseAdmin();

    const providerId = await getProviderIdForUser(user.id, supabaseAdmin);
    if (!providerId) return notFoundResponse("Provider not found");

    const searchParams = request.nextUrl.searchParams;
    const reportContext = await getProviderReportContext(supabaseAdmin, providerId);
    const tz = reportContext.timezone;
    const { fromDate, toDate } = reportDateRangeFromParams(searchParams, tz, {
      defaultDays: 90,
      maxDays: MAX_REPORT_DAYS,
    });
    const locationId = searchParams.get("location_id") || undefined;

    const fromIso = fromDate.toISOString();
    const toIso = toDate.toISOString();

    const allBookings = await fetchAllBookingsForScope(supabaseAdmin, providerId, locationId);

    const globalFirstScheduled = new Map<string, string>();
    for (const b of allBookings) {
      if (!b.customer_id) continue;
      const prev = globalFirstScheduled.get(b.customer_id);
      if (!prev || b.scheduled_at < prev) {
        globalFirstScheduled.set(b.customer_id, b.scheduled_at);
      }
    }

    const clientIds = new Set<string>();
    for (const b of allBookings) {
      if (!b.customer_id) continue;
      if (inScheduledWindow(b.scheduled_at, fromIso, toIso)) {
        clientIds.add(b.customer_id);
      }
    }

    const clientInfoMap = new Map<string, { full_name: string }>();
    if (clientIds.size > 0) {
      const { data: clients, error: clientError } = await supabaseAdmin
        .from("users")
        .select("id, full_name")
        .in("id", Array.from(clientIds));

      if (!clientError && clients) {
        for (const client of clients as { id: string; full_name?: string }[]) {
          clientInfoMap.set(client.id, { full_name: client.full_name || "Unknown" });
        }
      }
    }

    type ClientAgg = {
      clientId: string;
      clientName: string;
      totalBookings: number;
      totalSpent: number;
      lastVisit: string;
      firstVisitInWindow: string;
      bookings: BookingRow[];
    };

    const clientMap = new Map<string, ClientAgg>();

    for (const booking of allBookings) {
      const clientId = booking.customer_id;
      if (!clientId || !inScheduledWindow(booking.scheduled_at, fromIso, toIso)) continue;

      const clientInfo = clientInfoMap.get(clientId) || { full_name: "Unknown" };
      const existing = clientMap.get(clientId) || {
        clientId,
        clientName: clientInfo.full_name,
        totalBookings: 0,
        totalSpent: 0,
        lastVisit: booking.scheduled_at,
        firstVisitInWindow: booking.scheduled_at,
        bookings: [],
      };

      existing.totalBookings += 1;
      existing.totalSpent += Number(booking.total_amount || 0);
      existing.bookings.push(booking);

      if (booking.scheduled_at > existing.lastVisit) {
        existing.lastVisit = booking.scheduled_at;
      }
      if (booking.scheduled_at < existing.firstVisitInWindow) {
        existing.firstVisitInWindow = booking.scheduled_at;
      }

      clientMap.set(clientId, existing);
    }

    const clients = Array.from(clientMap.values());
    const totalClients = clients.length;

    let newClients = 0;
    for (const cid of clientIds) {
      const firstEver = globalFirstScheduled.get(cid);
      if (firstEver && firstEver >= fromIso && firstEver <= toIso) {
        newClients += 1;
      }
    }

    const returningClients = clients.filter((c) => c.totalBookings > 1).length;

    const averageBookingsPerClient =
      totalClients > 0 ? Math.round((clients.reduce((sum, c) => sum + c.totalBookings, 0) / totalClients) * 100) / 100 : 0;

    const windowBookingRows = allBookings.filter(
      (b) => b.customer_id && inScheduledWindow(b.scheduled_at, fromIso, toIso),
    );
    const ledgerByCustomer = await sumLedgerEarningsByCustomer(
      supabaseAdmin,
      providerId,
      fromDate,
      toDate,
      locationId,
      tz,
      windowBookingRows,
    );

    const totalBookedGross = clients.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalLedgerEarnings = [...ledgerByCustomer.values()].reduce((s, v) => s + v, 0);
    const averageBookedGross =
      totalClients > 0 ? Math.round((totalBookedGross / totalClients) * 100) / 100 : 0;
    const averageLedgerEarnings =
      totalClients > 0 ? Math.round((totalLedgerEarnings / totalClients) * 100) / 100 : 0;
    /** @deprecated Misleading name — equals averageBookedGross (in-window booked gross, not lifetime value). */
    const averageLifetimeValue = averageBookedGross;

    const completedBookingIds: string[] = [];
    for (const b of allBookings) {
      if (b.status === "completed" && inScheduledWindow(b.scheduled_at, fromIso, toIso)) {
        completedBookingIds.push(b.id);
      }
    }

    const reviewsMap = new Map<string, number[]>();
    const bookingCustomer = new Map<string, string>();
    for (const b of allBookings) {
      if (b.customer_id) bookingCustomer.set(b.id, b.customer_id);
    }

    for (let i = 0; i < completedBookingIds.length; i += REVIEW_IN_CHUNK) {
      const chunk = completedBookingIds.slice(i, i + REVIEW_IN_CHUNK);
      if (chunk.length === 0) continue;
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .from("reviews")
        .select("booking_id, rating")
        .in("booking_id", chunk)
        .not("rating", "is", null);

      if (!reviewsError && reviews) {
        for (const review of reviews as { booking_id: string; rating: number }[]) {
          const cid = bookingCustomer.get(review.booking_id);
          if (!cid) continue;
          if (!reviewsMap.has(cid)) reviewsMap.set(cid, []);
          reviewsMap.get(cid)!.push(Number(review.rating));
        }
      }
    }

    const topClients: ClientSummaryTopClient[] = clients
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map((client) => {
        const clientRatings = reviewsMap.get(client.clientId) || [];
        const averageRating =
          clientRatings.length > 0
            ? Math.round((clientRatings.reduce((sum, rating) => sum + rating, 0) / clientRatings.length) * 10) / 10
            : 0;

        return {
          clientId: client.clientId,
          clientName: client.clientName,
          totalBookings: client.totalBookings,
          totalSpent: client.totalSpent,
          ledgerEarnings: Math.round((ledgerByCustomer.get(client.clientId) || 0) * 100) / 100,
          lastVisit: client.lastVisit,
          averageRating,
        };
      });

    const retentionRate = totalClients > 0 ? Math.round((returningClients / totalClients) * 1000) / 10 : 0;

    const inclusiveDayCount = differenceInCalendarDays(toDate, fromDate) + 1;

    const locPhrase = locationId
      ? "Selected location only; first-ever visit is computed within that location’s bookings."
      : "All locations; first-ever visit is the earliest scheduled appointment anywhere with your business.";

    const basisNote = [
      `Reporting timezone: ${tz}. Scheduled window uses bookings.scheduled_at between the inclusive provider-local bounds.`,
      `Distinct clients: customers with at least one appointment scheduled in this window (guest walk-ins without customer_id are excluded).`,
      `New clients: customers whose first-ever scheduled booking in this scope falls inside the window (${locPhrase}).`,
      `Returning (label): customers with two or more appointments scheduled inside this window — not lifetime repeat visits.`,
      `averageBookedGross is each client’s mean sum of booking.total_amount in this window. averageLifetimeValue is a deprecated alias of averageBookedGross (not lifetime value). Ledger earnings is net provider_earnings settled in the same window — compare to Revenue report, not to booked gross.`,
      `Retention % = (clients with 2+ bookings in window) ÷ (distinct clients in window).`,
      `Ratings average review.rating for completed bookings in the window, grouped by customer.`,
    ].join(" ");

    const reportBasis =
      "Client counts and spend from bookings in range; new clients use first-ever booking date in scope; retention counts repeat visits inside the range.";

    return successResponse({
      totalClients,
      newClients,
      returningClients,
      averageLifetimeValue,
      averageBookedGross,
      averageLedgerEarnings,
      averageBookingsPerClient,
      topClients,
      clientRetention: {
        period: `${inclusiveDayCount} days`,
        inclusiveDayCount,
        retentionRate,
      },
      basisNote,
      reportBasis,
      timezone: tz,
    } satisfies ClientSummaryResponse);
  } catch (error) {
    console.error("Error in client summary report:", error);
    return handleApiError(error, "Failed to generate client summary report");
  }
}
