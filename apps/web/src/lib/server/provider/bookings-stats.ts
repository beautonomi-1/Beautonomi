import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import {
  dateRangeBoundsUtc,
  formatDateYmd,
  nowInTz,
  resolveTz,
} from "@/lib/dates/provider-tz";
import { RECOGNIZED_REVENUE_TYPES, recognizedRevenueInRange } from "@/lib/reports/provider-revenue-semantics";
import { fetchAllLedgerPages } from "@/lib/reports/fetch-all-ledger-pages";
import { MAX_FINANCE_TRANSACTIONS } from "@/lib/reports/constants";
import { filterLedgerRowsForLocation } from "@/lib/reports/provider-report-utils";
import { dashboardBookingLocationOrFilter } from "@/lib/server/provider/dashboard-booking-location-filter";

export type BookingsStatsRange = "today" | "week" | "month" | "all";

export type BookingsStatsResult = {
  range: BookingsStatsRange;
  timezone: string;
  booked_gmv: number;
  recognized_revenue: number;
  appointment_count: number;
  pending_count: number;
  in_progress_count: number;
  completed_count: number;
  basis_note: string;
};

const TERMINAL_STATUSES = new Set(["cancelled", "canceled", "no_show"]);

function resolveStatsWindow(
  range: BookingsStatsRange,
  timezone: string,
): { scheduledFromIso?: string; scheduledToIso?: string; ledgerFrom?: Date; ledgerTo?: Date } {
  const tz = resolveTz(timezone);
  const businessNow = nowInTz(tz);
  const todayYmd = formatDateYmd(businessNow, tz);

  if (range === "all") {
    return {};
  }

  let fromYmd = todayYmd;
  if (range === "week") {
    const zNow = toZonedTime(businessNow, tz);
    fromYmd = formatDateYmd(startOfWeek(zNow, { weekStartsOn: 1 }), tz);
  } else if (range === "month") {
    fromYmd = formatDateYmd(
      new Date(businessNow.getFullYear(), businessNow.getMonth(), 1),
      tz,
    );
  }

  const bounds = dateRangeBoundsUtc(fromYmd, todayYmd, tz);
  return {
    scheduledFromIso: bounds.fromIso,
    scheduledToIso: bounds.toIso,
    ledgerFrom: new Date(bounds.fromIso),
    ledgerTo: new Date(bounds.toIso),
  };
}

export async function computeBookingsStats(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  range: BookingsStatsRange,
  locationId?: string | null,
): Promise<BookingsStatsResult> {
  const { data: providerRow } = await supabaseAdmin
    .from("providers")
    .select("timezone")
    .eq("id", providerId)
    .maybeSingle();
  const timezone = resolveTz((providerRow as { timezone?: string | null } | null)?.timezone);
  const window = resolveStatsWindow(range, timezone);

  let bookingsQuery = supabaseAdmin
    .from("bookings")
    .select("id, scheduled_at, total_amount, status")
    .eq("provider_id", providerId);

  if (locationId) {
    bookingsQuery = bookingsQuery.or(dashboardBookingLocationOrFilter(locationId));
  }
  if (window.scheduledFromIso) {
    bookingsQuery = bookingsQuery.gte("scheduled_at", window.scheduledFromIso);
  }
  if (window.scheduledToIso) {
    bookingsQuery = bookingsQuery.lte("scheduled_at", window.scheduledToIso);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;
  if (bookingsError) throw bookingsError;

  let bookedGmv = 0;
  let appointmentCount = 0;
  let pendingCount = 0;
  let inProgressCount = 0;
  let completedCount = 0;

  for (const row of bookings ?? []) {
    const status = String(row.status ?? "").toLowerCase();
    if (status === "pending" || status === "pending_payment") pendingCount += 1;
    if (
      status === "in_progress" ||
      status === "started" ||
      status === "waiting" ||
      status === "checked_in"
    ) {
      inProgressCount += 1;
    }
    if (status === "completed") completedCount += 1;

    if (TERMINAL_STATUSES.has(status)) continue;
    appointmentCount += 1;
    bookedGmv += Number(row.total_amount ?? 0);
  }

  const ledgerQuery = supabaseAdmin
    .from("finance_transactions")
    .select("transaction_type, amount, net, created_at, booking_id, product_order_id")
    .eq("provider_id", providerId)
    .in("transaction_type", [...RECOGNIZED_REVENUE_TYPES])
    .order("created_at", { ascending: true });

  if (window.ledgerFrom) {
    ledgerQuery.gte("created_at", window.ledgerFrom.toISOString());
  }
  if (window.ledgerTo) {
    ledgerQuery.lte("created_at", window.ledgerTo.toISOString());
  }

  const ledgerRows = await fetchAllLedgerPages(
    ledgerQuery as Parameters<typeof fetchAllLedgerPages>[0],
    MAX_FINANCE_TRANSACTIONS,
  );
  const scopedLedger = await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    ledgerRows,
    locationId ?? null,
  );

  const recognizedRevenue = recognizedRevenueInRange(scopedLedger, {
    start: window.ledgerFrom,
    end: window.ledgerTo,
  });

  return {
    range,
    timezone,
    booked_gmv: bookedGmv,
    recognized_revenue: recognizedRevenue,
    appointment_count: appointmentCount,
    pending_count: pendingCount,
    in_progress_count: inProgressCount,
    completed_count: completedCount,
    basis_note:
      "Booked GMV sums booking.total_amount for non-cancelled appointments scheduled in the window (provider timezone). Recognized revenue sums ledger settlement in the same window — comparable to dashboard total earned.",
  };
}
