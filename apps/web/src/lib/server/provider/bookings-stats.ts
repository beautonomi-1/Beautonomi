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
import {
  dashboardBookingLocationOrFilter,
  dashboardGroupBookingLocationOrFilter,
} from "@/lib/server/provider/dashboard-booking-location-filter";
import {
  applyPendingBookingsScope,
  applyPendingGroupsScope,
  PENDING_REVIEW_DB_STATUSES,
} from "@/lib/server/provider/pending-bookings-scope";

export type BookingsStatsRange = "today" | "week" | "month" | "all";

export type BookingsStatsResult = {
  range: BookingsStatsRange;
  timezone: string;
  booked_gmv: number;
  recognized_revenue: number;
  appointment_count: number;
  pending_count: number;
  confirmed_count: number;
  in_progress_count: number;
  completed_count: number;
  cancelled_count: number;
  no_show_count: number;
  basis_note: string;
};

const TERMINAL_STATUSES = new Set(["cancelled", "canceled", "no_show"]);
const GMV_PAGE_SIZE = 1000;

/** Valid `booking_status` enum values — do not pass portal aliases like `started` or `canceled`. */
const BOOKING_STATUS = {
  confirmed: ["confirmed"] as const,
  inProgress: ["in_progress", "waiting", "checked_in"] as const,
  completed: ["completed"] as const,
  cancelled: ["cancelled"] as const,
  noShow: ["no_show"] as const,
} as const;

/** `group_bookings.status` is TEXT with its own CHECK constraint (includes booked/started). */
const GROUP_BOOKING_STATUS = {
  confirmed: ["confirmed", "booked"] as const,
  inProgress: ["started"] as const,
  completed: ["completed"] as const,
  cancelled: ["cancelled"] as const,
} as const;

type StatsWindow = {
  scheduledFromIso?: string;
  scheduledToIso?: string;
  ledgerFrom?: Date;
  ledgerTo?: Date;
};

type HeadCountResult = Promise<{ count: number | null; error: unknown }>;

type HeadCountBuilder = {
  eq: (col: string, value: unknown) => HeadCountBuilder;
  in: (col: string, values: readonly string[]) => HeadCountBuilder;
  is: (col: string, value: null) => HeadCountBuilder;
  or: (filter: string) => HeadCountBuilder;
  gte: (col: string, value: string) => HeadCountBuilder;
  lte: (col: string, value: string) => HeadCountBuilder;
  select: (cols: string, opts: { count: "exact"; head: true }) => HeadCountResult;
};

function resolveStatsWindow(
  range: BookingsStatsRange,
  timezone: string,
): StatsWindow {
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

async function countExact(query: HeadCountBuilder): Promise<number> {
  const { count, error } = await query.select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

function applyScheduledWindow(query: HeadCountBuilder, window: StatsWindow): HeadCountBuilder {
  let q = query;
  if (window.scheduledFromIso) q = q.gte("scheduled_at", window.scheduledFromIso);
  if (window.scheduledToIso) q = q.lte("scheduled_at", window.scheduledToIso);
  return q;
}

function applyBookingLocation(query: HeadCountBuilder, locationId?: string | null): HeadCountBuilder {
  if (!locationId) return query;
  return query.or(dashboardBookingLocationOrFilter(locationId));
}

function applyGroupLocation(query: HeadCountBuilder, locationId?: string | null): HeadCountBuilder {
  if (!locationId) return query;
  return query.or(dashboardGroupBookingLocationOrFilter(locationId));
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";
const ID_IN_CHUNK = 200;

function chunkIds(ids: string[], size = ID_IN_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function applyIdScope(query: HeadCountBuilder, ids?: string[] | null): HeadCountBuilder {
  if (!ids) return query;
  if (ids.length === 0) return query.eq("id", EMPTY_UUID);
  return query.in("id", ids);
}

type StaffScopeIds = {
  standaloneBookingIds: string[];
  groupIds: string[];
  ledgerBookingIds: string[];
};

async function fetchPagedIds(
  supabaseAdmin: SupabaseClient,
  table: "bookings" | "group_bookings" | "booking_services",
  columns: string,
  apply: (query: {
    eq: (col: string, value: unknown) => any;
    in: (col: string, values: readonly string[]) => any;
    range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
  }) => {
    range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
  },
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const built = apply(
      supabaseAdmin.from(table).select(columns) as unknown as {
        eq: (col: string, value: unknown) => any;
        in: (col: string, values: readonly string[]) => any;
        range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
      },
    );
    const { data, error } = await built.range(offset, offset + GMV_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < GMV_PAGE_SIZE) break;
    offset += GMV_PAGE_SIZE;
  }
  return rows;
}

/**
 * Calendar-scope IDs: booking header staff, any booking_services line, and
 * group parents the staff leads or appears on as a child.
 */
async function resolveStaffScopeIds(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  staffId: string,
): Promise<StaffScopeIds> {
  const standalone = new Set<string>();
  const groups = new Set<string>();
  const ledger = new Set<string>();

  const headerRows = await fetchPagedIds(supabaseAdmin, "bookings", "id, group_booking_id", (q) =>
    q.eq("provider_id", providerId).eq("staff_id", staffId),
  );
  for (const row of headerRows) {
    const id = String(row.id ?? "");
    const groupId = row.group_booking_id ? String(row.group_booking_id) : null;
    if (!id) continue;
    ledger.add(id);
    if (groupId) groups.add(groupId);
    else standalone.add(id);
  }

  const lineRows = await fetchPagedIds(supabaseAdmin, "booking_services", "booking_id", (q) =>
    q.eq("staff_id", staffId),
  );
  const lineBookingIds = [
    ...new Set(lineRows.map((row) => String(row.booking_id ?? "")).filter(Boolean)),
  ];
  for (const chunk of chunkIds(lineBookingIds)) {
    const owned = await fetchPagedIds(supabaseAdmin, "bookings", "id, group_booking_id", (q) =>
      q.eq("provider_id", providerId).in("id", chunk),
    );
    for (const row of owned) {
      const id = String(row.id ?? "");
      const groupId = row.group_booking_id ? String(row.group_booking_id) : null;
      if (!id) continue;
      ledger.add(id);
      if (groupId) groups.add(groupId);
      else standalone.add(id);
    }
  }

  const groupRows = await fetchPagedIds(supabaseAdmin, "group_bookings", "id", (q) =>
    q.eq("provider_id", providerId).eq("staff_id", staffId),
  );
  for (const row of groupRows) {
    const id = String(row.id ?? "");
    if (id) groups.add(id);
  }

  for (const chunk of chunkIds([...groups])) {
    const children = await fetchPagedIds(supabaseAdmin, "bookings", "id", (q) =>
      q.eq("provider_id", providerId).in("group_booking_id", chunk),
    );
    for (const row of children) {
      const id = String(row.id ?? "");
      if (id) ledger.add(id);
    }
  }

  return {
    standaloneBookingIds: [...standalone],
    groupIds: [...groups],
    ledgerBookingIds: [...ledger],
  };
}

function emptyBookingsStats(range: BookingsStatsRange, timezone: string): BookingsStatsResult {
  return {
    range,
    timezone,
    booked_gmv: 0,
    recognized_revenue: 0,
    appointment_count: 0,
    pending_count: 0,
    confirmed_count: 0,
    in_progress_count: 0,
    completed_count: 0,
    cancelled_count: 0,
    no_show_count: 0,
    basis_note:
      "Counts mirror the merged provider bookings list: standalone rows exclude group children; group parents are included. Pending = standalone pending/pending_payment + pending group parents. Booked GMV sums non-cancelled totals scheduled in the window.",
  };
}

function bookingsHeadCount(supabaseAdmin: SupabaseClient): HeadCountBuilder {
  return supabaseAdmin.from("bookings").select("id", {
    count: "exact",
    head: true,
  }) as unknown as HeadCountBuilder;
}

function groupsHeadCount(supabaseAdmin: SupabaseClient): HeadCountBuilder {
  return supabaseAdmin.from("group_bookings").select("id", {
    count: "exact",
    head: true,
  }) as unknown as HeadCountBuilder;
}

async function countStandaloneBookings(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  statuses: readonly string[],
  window: StatsWindow,
  locationId?: string | null,
  staffBookingIds?: string[] | null,
): Promise<number> {
  if (staffBookingIds && staffBookingIds.length === 0) return 0;
  let q = bookingsHeadCount(supabaseAdmin)
    .eq("provider_id", providerId)
    .in("status", [...statuses])
    .is("group_booking_id", null);
  q = applyScheduledWindow(q, window);
  q = applyBookingLocation(q, locationId);
  q = applyIdScope(q, staffBookingIds);
  return countExact(q);
}

async function countGroupBookings(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  statuses: readonly string[],
  window: StatsWindow,
  locationId?: string | null,
  staffGroupIds?: string[] | null,
): Promise<number> {
  if (staffGroupIds && staffGroupIds.length === 0) return 0;
  let q = groupsHeadCount(supabaseAdmin)
    .eq("provider_id", providerId)
    .in("status", [...statuses]);
  q = applyScheduledWindow(q, window);
  q = applyGroupLocation(q, locationId);
  q = applyIdScope(q, staffGroupIds);
  return countExact(q);
}

async function sumBookedGmv(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  window: StatsWindow,
  locationId?: string | null,
  staffScope?: StaffScopeIds | null,
): Promise<number> {
  if (staffScope && staffScope.standaloneBookingIds.length === 0 && staffScope.groupIds.length === 0) {
    return 0;
  }
  let total = 0;
  let offset = 0;

  while (true) {
    let q = supabaseAdmin
      .from("bookings")
      .select("total_amount, status")
      .eq("provider_id", providerId)
      .is("group_booking_id", null)
      .order("scheduled_at", { ascending: true })
      .range(offset, offset + GMV_PAGE_SIZE - 1);
    if (staffScope) {
      q = q.in(
        "id",
        staffScope.standaloneBookingIds.length > 0 ? staffScope.standaloneBookingIds : [EMPTY_UUID],
      );
    }
    if (window.scheduledFromIso) q = q.gte("scheduled_at", window.scheduledFromIso);
    if (window.scheduledToIso) q = q.lte("scheduled_at", window.scheduledToIso);
    if (locationId) q = q.or(dashboardBookingLocationOrFilter(locationId));
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const status = String((row as { status?: string }).status ?? "").toLowerCase();
      if (TERMINAL_STATUSES.has(status)) continue;
      total += Number((row as { total_amount?: number }).total_amount ?? 0);
    }
    if (rows.length < GMV_PAGE_SIZE) break;
    offset += GMV_PAGE_SIZE;
  }

  offset = 0;
  while (true) {
    let q = supabaseAdmin
      .from("group_bookings")
      .select("total_price, status")
      .eq("provider_id", providerId)
      .order("scheduled_at", { ascending: true })
      .range(offset, offset + GMV_PAGE_SIZE - 1);
    if (staffScope) {
      q = q.in("id", staffScope.groupIds.length > 0 ? staffScope.groupIds : [EMPTY_UUID]);
    }
    if (window.scheduledFromIso) q = q.gte("scheduled_at", window.scheduledFromIso);
    if (window.scheduledToIso) q = q.lte("scheduled_at", window.scheduledToIso);
    if (locationId) q = q.or(dashboardGroupBookingLocationOrFilter(locationId));
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      const status = String((row as { status?: string }).status ?? "").toLowerCase();
      if (TERMINAL_STATUSES.has(status)) continue;
      total += Number((row as { total_price?: number }).total_price ?? 0);
    }
    if (rows.length < GMV_PAGE_SIZE) break;
    offset += GMV_PAGE_SIZE;
  }

  return total;
}

export async function computeBookingsStats(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  range: BookingsStatsRange,
  locationId?: string | null,
  staffId?: string | null,
): Promise<BookingsStatsResult> {
  const { data: providerRow } = await supabaseAdmin
    .from("providers")
    .select("timezone")
    .eq("id", providerId)
    .maybeSingle();
  const timezone = resolveTz((providerRow as { timezone?: string | null } | null)?.timezone);
  const window = resolveStatsWindow(range, timezone);
  const staffScope = staffId
    ? await resolveStaffScopeIds(supabaseAdmin, providerId, staffId)
    : null;
  if (
    staffScope &&
    staffScope.standaloneBookingIds.length === 0 &&
    staffScope.groupIds.length === 0
  ) {
    return emptyBookingsStats(range, timezone);
  }
  const standaloneIds = staffScope?.standaloneBookingIds ?? null;
  const groupIds = staffScope?.groupIds ?? null;

  const [
    pendingStandalone,
    pendingGroups,
    confirmedStandalone,
    confirmedGroupsBooked,
    inProgressStandalone,
    inProgressGroups,
    completedStandalone,
    completedGroups,
    cancelledStandalone,
    cancelledGroups,
    noShowStandalone,
  ] = await Promise.all([
    (async () => {
      if (standaloneIds && standaloneIds.length === 0) return 0;
      let q = bookingsHeadCount(supabaseAdmin).eq("provider_id", providerId);
      q = applyPendingBookingsScope(q, locationId);
      q = applyScheduledWindow(q, window);
      q = applyIdScope(q, standaloneIds);
      return countExact(q);
    })(),
    (async () => {
      if (groupIds && groupIds.length === 0) return 0;
      let q = groupsHeadCount(supabaseAdmin).eq("provider_id", providerId);
      q = applyPendingGroupsScope(q, locationId);
      q = applyScheduledWindow(q, window);
      q = applyIdScope(q, groupIds);
      return countExact(q);
    })(),
    countStandaloneBookings(supabaseAdmin, providerId, BOOKING_STATUS.confirmed, window, locationId, standaloneIds),
    countGroupBookings(supabaseAdmin, providerId, GROUP_BOOKING_STATUS.confirmed, window, locationId, groupIds),
    countStandaloneBookings(supabaseAdmin, providerId, BOOKING_STATUS.inProgress, window, locationId, standaloneIds),
    countGroupBookings(supabaseAdmin, providerId, GROUP_BOOKING_STATUS.inProgress, window, locationId, groupIds),
    countStandaloneBookings(supabaseAdmin, providerId, BOOKING_STATUS.completed, window, locationId, standaloneIds),
    countGroupBookings(supabaseAdmin, providerId, GROUP_BOOKING_STATUS.completed, window, locationId, groupIds),
    countStandaloneBookings(supabaseAdmin, providerId, BOOKING_STATUS.cancelled, window, locationId, standaloneIds),
    countGroupBookings(supabaseAdmin, providerId, GROUP_BOOKING_STATUS.cancelled, window, locationId, groupIds),
    countStandaloneBookings(supabaseAdmin, providerId, BOOKING_STATUS.noShow, window, locationId, standaloneIds),
  ]);

  const pendingCount = pendingStandalone + pendingGroups;
  const confirmedCount = confirmedStandalone + confirmedGroupsBooked;
  const inProgressCount = inProgressStandalone + inProgressGroups;
  const completedCount = completedStandalone + completedGroups;
  const cancelledCount = cancelledStandalone + cancelledGroups;
  const noShowCount = noShowStandalone;

  const bookedGmv = await sumBookedGmv(supabaseAdmin, providerId, window, locationId, staffScope);

  const appointmentCount =
    pendingCount + confirmedCount + inProgressCount + completedCount;

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
  const locationScopedLedger = await filterLedgerRowsForLocation(
    supabaseAdmin,
    providerId,
    ledgerRows,
    locationId ?? null,
  );
  const ledgerBookingSet = staffScope ? new Set(staffScope.ledgerBookingIds) : null;
  const scopedLedger = ledgerBookingSet
    ? locationScopedLedger.filter((row) => {
        const bookingId = (row as { booking_id?: string | null }).booking_id;
        return Boolean(bookingId && ledgerBookingSet.has(bookingId));
      })
    : locationScopedLedger;

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
    confirmed_count: confirmedCount,
    in_progress_count: inProgressCount,
    completed_count: completedCount,
    cancelled_count: cancelledCount,
    no_show_count: noShowCount,
    basis_note:
      "Counts mirror the merged provider bookings list: standalone rows exclude group children; group parents are included. Pending = standalone pending/pending_payment + pending group parents. Booked GMV sums non-cancelled totals scheduled in the window.",
  };
}

export { PENDING_REVIEW_DB_STATUSES, BOOKING_STATUS, GROUP_BOOKING_STATUS };
