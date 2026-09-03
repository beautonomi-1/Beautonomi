import { RECOGNIZED_REVENUE_TYPES } from "@/lib/reports/provider-revenue-semantics";
import type {
  DashboardSnapshotBookingCounts,
  DashboardSnapshotPeriodNumbers,
  DashboardSnapshotRevenue,
} from "@/lib/server/provider/dashboard-snapshot-rpc";

/**
 * TypeScript twin of the SQL in `provider_dashboard_snapshot` (migration 877).
 *
 * This is NOT used on the request path — it exists so the parity test can assert
 * that the SQL semantics (half-open `[start, end)` windows, recognized-revenue type
 * list, `COALESCE(net, amount, 0)`, status buckets) agree with the Node aggregation in
 * get-provider-dashboard.ts on a fixture. Keep every predicate here byte-for-byte
 * aligned with the SQL; if you change one, change the other.
 */

export type SnapshotWindow = { start: Date; end: Date }; // end EXCLUSIVE (SQL `<`)

export type SnapshotWindows = {
  today: SnapshotWindow;
  this_week: SnapshotWindow;
  this_month: SnapshotWindow;
  last_month: SnapshotWindow;
  yesterday: SnapshotWindow;
  prior_week: SnapshotWindow;
  prior_month: SnapshotWindow;
};

export type SnapshotBookingRow = {
  status?: string | null;
  scheduled_at?: string | null;
  location_type?: string | null;
};

export type SnapshotLedgerRow = {
  transaction_type: string;
  amount?: number | null;
  net?: number | null;
  created_at: string;
};

const ACTIVE = new Set(["pending", "pending_payment", "confirmed", "waiting", "checked_in", "in_progress"]);
const CONFIRMED = new Set(["confirmed", "waiting", "checked_in"]);
const PENDING = new Set(["pending", "pending_payment"]);
const SCHEDULE = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "waiting",
  "checked_in",
  "in_progress",
  "completed",
]);
const RECOGNIZED: ReadonlySet<string> = new Set(RECOGNIZED_REVENUE_TYPES);

function inHalfOpen(date: Date | null, w: SnapshotWindow): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  return date >= w.start && date < w.end;
}

export function referenceBookingCounts(rows: ReadonlyArray<SnapshotBookingRow>): DashboardSnapshotBookingCounts {
  const c: DashboardSnapshotBookingCounts = {
    total_bookings: 0,
    active_bookings: 0,
    confirmed_bookings: 0,
    pending_bookings: 0,
    completed_bookings: 0,
    cancelled_bookings: 0,
    no_show_bookings: 0,
    at_home_bookings: 0,
    at_salon_bookings: 0,
    at_home_completed: 0,
    at_salon_completed: 0,
    at_home_confirmed: 0,
    at_salon_confirmed: 0,
    at_home_pending: 0,
    at_salon_pending: 0,
    at_home_cancelled: 0,
    at_salon_cancelled: 0,
    at_home_no_show: 0,
    at_salon_no_show: 0,
  };
  for (const b of rows) {
    const status = String(b.status ?? "");
    const home = b.location_type === "at_home";
    const salon = b.location_type === "at_salon";
    c.total_bookings++;
    if (ACTIVE.has(status)) c.active_bookings++;
    if (CONFIRMED.has(status)) {
      c.confirmed_bookings++;
      if (home) c.at_home_confirmed++;
      if (salon) c.at_salon_confirmed++;
    }
    if (PENDING.has(status)) {
      c.pending_bookings++;
      if (home) c.at_home_pending++;
      if (salon) c.at_salon_pending++;
    }
    if (status === "completed") {
      c.completed_bookings++;
      if (home) c.at_home_completed++;
      if (salon) c.at_salon_completed++;
    }
    if (status === "cancelled") {
      c.cancelled_bookings++;
      if (home) c.at_home_cancelled++;
      if (salon) c.at_salon_cancelled++;
    }
    if (status === "no_show") {
      c.no_show_bookings++;
      if (home) c.at_home_no_show++;
      if (salon) c.at_salon_no_show++;
    }
    if (home) c.at_home_bookings++;
    if (salon) c.at_salon_bookings++;
  }
  return c;
}

export function referenceScheduleCounts(
  rows: ReadonlyArray<SnapshotBookingRow>,
  windows: SnapshotWindows,
): DashboardSnapshotPeriodNumbers {
  const out: DashboardSnapshotPeriodNumbers = {
    today: 0,
    this_week: 0,
    this_month: 0,
    yesterday: 0,
    prior_week: 0,
    prior_month: 0,
  };
  for (const b of rows) {
    if (!SCHEDULE.has(String(b.status ?? ""))) continue;
    const when = b.scheduled_at ? new Date(b.scheduled_at) : null;
    if (inHalfOpen(when, windows.today)) out.today++;
    if (inHalfOpen(when, windows.this_week)) out.this_week++;
    if (inHalfOpen(when, windows.this_month)) out.this_month++;
    if (inHalfOpen(when, windows.yesterday)) out.yesterday++;
    if (inHalfOpen(when, windows.prior_week)) out.prior_week++;
    if (inHalfOpen(when, windows.prior_month)) out.prior_month++;
  }
  return out;
}

/** SQL: SUM(COALESCE(net, amount, 0)) FILTER (WHERE type IN recognized AND created_at in [start, end)). */
export function referenceRevenueWindows(
  rows: ReadonlyArray<SnapshotLedgerRow>,
  windows: SnapshotWindows,
): DashboardSnapshotRevenue {
  const out: DashboardSnapshotRevenue = {
    today: 0,
    this_week: 0,
    this_month: 0,
    last_month: 0,
    yesterday: 0,
    prior_week: 0,
    prior_month: 0,
  };
  // Revenue today/this_week/this_month all end at end-of-today (SQL uses u_today_end).
  const revenueWindows: Record<keyof DashboardSnapshotRevenue, SnapshotWindow> = {
    today: windows.today,
    this_week: { start: windows.this_week.start, end: windows.today.end },
    this_month: { start: windows.this_month.start, end: windows.today.end },
    last_month: windows.last_month,
    yesterday: windows.yesterday,
    prior_week: windows.prior_week,
    prior_month: windows.prior_month,
  };
  for (const r of rows) {
    if (!RECOGNIZED.has(r.transaction_type)) continue;
    const net = Number(r.net ?? r.amount ?? 0);
    const when = new Date(r.created_at);
    for (const key of Object.keys(revenueWindows) as Array<keyof DashboardSnapshotRevenue>) {
      if (inHalfOpen(when, revenueWindows[key])) out[key] += net;
    }
  }
  return out;
}
