import { beforeEach, describe, expect, it, vi } from "vitest";

import { recognizedRevenueInRange } from "@/lib/reports/provider-revenue-semantics";
import { countBookingStatusInWindow } from "@/lib/server/provider/build-dashboard-period-breakdown";
import {
  __resetDashboardSnapshotCacheForTests,
  dashboardSnapshotCacheKey,
  fetchProviderDashboardSnapshot,
  getProviderDashboardSnapshotCached,
  isDashboardSnapshotRpcEnabled,
  parseDashboardSnapshot,
} from "@/lib/server/provider/dashboard-snapshot-rpc";
import {
  referenceBookingCounts,
  referenceRevenueWindows,
  referenceScheduleCounts,
  type SnapshotBookingRow,
  type SnapshotLedgerRow,
  type SnapshotWindows,
} from "@/lib/server/provider/dashboard-snapshot-reference";

/**
 * Parity: Node dashboard aggregation vs `provider_dashboard_snapshot` SQL semantics.
 *
 * The SQL itself cannot execute under vitest (no Postgres). Instead
 * `dashboard-snapshot-reference.ts` is a line-by-line TS twin of the SQL predicates
 * (half-open windows, recognized-type list, COALESCE(net, amount, 0), status buckets)
 * and this suite asserts that twin agrees with the Node functions the dashboard uses
 * today (`recognizedRevenueInRange` with inclusive 23:59:59.999 ends, the status-tile
 * loop, `countBookingStatusInWindow`) on a boundary-heavy fixture. The mapping function
 * `parseDashboardSnapshot` is tested against the exact jsonb shape the RPC emits.
 */

// Africa/Johannesburg is UTC+2 with no DST. "Today" = Wed 2026-03-11 local.
const T = (iso: string) => new Date(iso);
const windows: SnapshotWindows = {
  today: { start: T("2026-03-10T22:00:00Z"), end: T("2026-03-11T22:00:00Z") },
  this_week: { start: T("2026-03-07T22:00:00Z"), end: T("2026-03-14T22:00:00Z") }, // Sun 8th → Sun 15th
  this_month: { start: T("2026-02-28T22:00:00Z"), end: T("2026-03-31T22:00:00Z") },
  last_month: { start: T("2026-01-31T22:00:00Z"), end: T("2026-02-28T22:00:00Z") },
  yesterday: { start: T("2026-03-09T22:00:00Z"), end: T("2026-03-10T22:00:00Z") },
  prior_week: { start: T("2026-02-28T22:00:00Z"), end: T("2026-03-04T22:00:00Z") }, // Sun 1st → Wed 4th (4 days)
  prior_month: { start: T("2026-01-31T22:00:00Z"), end: T("2026-02-11T22:00:00Z") }, // Feb 1 → Feb 11
};

/** Node-style inclusive end (`dateRangeBoundsUtc(...).toIso` is 23:59:59.999 local). */
const inclusiveEnd = (d: Date) => new Date(d.getTime() - 1);

const ledger: SnapshotLedgerRow[] = [
  // today: boundary rows
  { transaction_type: "provider_earnings", amount: 100, net: 80, created_at: "2026-03-10T22:00:00.000Z" }, // == start (in)
  { transaction_type: "tip", amount: 20, net: null, created_at: "2026-03-11T21:59:59.999Z" }, // last ms (in), COALESCE→amount
  { transaction_type: "travel_fee", amount: 50, net: 50, created_at: "2026-03-11T22:00:00.000Z" }, // == exclusive end (out)
  { transaction_type: "platform_fee", amount: 15, net: -15, created_at: "2026-03-11T10:00:00Z" }, // not recognized
  { transaction_type: "refund", amount: -30, net: -30, created_at: "2026-03-11T11:00:00Z" }, // not recognized (gross)
  // earlier this week / yesterday
  { transaction_type: "membership_provider_earnings", amount: 300, net: 240, created_at: "2026-03-10T08:00:00Z" },
  { transaction_type: "provider_earnings", amount: 90, net: -40, created_at: "2026-03-08T05:00:00Z" }, // legacy reversal
  // prior week same-days (Mar 1–4), and a row on Mar 5 that must be excluded from prior_week
  { transaction_type: "cancellation_fee", amount: 25, net: 25, created_at: "2026-03-02T09:00:00Z" },
  { transaction_type: "walk_in_additional_charge", amount: 60, net: 60, created_at: "2026-03-05T09:00:00Z" },
  // last month: inside prior-month MTD and outside it
  { transaction_type: "provider_earnings", amount: 500, net: 400, created_at: "2026-02-05T10:00:00Z" },
  { transaction_type: "provider_earnings", amount: 700, net: 560, created_at: "2026-02-20T10:00:00Z" },
  { transaction_type: "tip", amount: 10, net: 10, created_at: "2026-02-11T21:59:59.999Z" }, // last ms of Feb 11 (in prior_month)
  { transaction_type: "tip", amount: 11, net: 11, created_at: "2026-02-11T22:00:00.000Z" }, // Feb 12 local (out of prior_month)
  // two months ago: outside everything
  { transaction_type: "provider_earnings", amount: 999, net: 999, created_at: "2026-01-15T10:00:00Z" },
];

const bookings: SnapshotBookingRow[] = [
  { status: "confirmed", scheduled_at: "2026-03-11T08:00:00Z", location_type: "at_home" },
  { status: "pending_payment", scheduled_at: "2026-03-11T21:59:59.999Z", location_type: "at_salon" },
  { status: "in_progress", scheduled_at: "2026-03-11T22:00:00.000Z", location_type: "at_salon" }, // tomorrow local
  { status: "completed", scheduled_at: "2026-03-10T09:00:00Z", location_type: "at_salon" }, // yesterday
  { status: "cancelled", scheduled_at: "2026-03-10T09:30:00Z", location_type: "at_home" }, // yesterday, not scheduled-count
  { status: "no_show", scheduled_at: "2026-03-09T09:30:00Z", location_type: "at_salon" },
  { status: "waiting", scheduled_at: "2026-03-13T10:00:00Z", location_type: "at_home" }, // later this week (upcoming)
  { status: "checked_in", scheduled_at: "2026-03-25T10:00:00Z", location_type: null }, // later this month
  { status: "completed", scheduled_at: "2026-03-03T10:00:00Z", location_type: "at_salon" }, // prior week same-days
  { status: "completed", scheduled_at: "2026-03-05T10:00:00Z", location_type: "at_salon" }, // prior week, past same-days
  { status: "completed", scheduled_at: "2026-02-10T10:00:00Z", location_type: "at_home" }, // prior month MTD
  { status: "completed", scheduled_at: "2026-02-20T10:00:00Z", location_type: "at_home" }, // prior month, past MTD
  { status: "pending", scheduled_at: null, location_type: "at_salon" }, // no schedule
  { status: "completed", scheduled_at: "2025-11-01T10:00:00Z", location_type: "at_salon" },
];

/** Verbatim copy of the status-tile loop in get-provider-dashboard.ts (Node path). */
function nodeStatusTiles(rows: SnapshotBookingRow[]) {
  const PENDING = new Set(["pending", "pending_payment"]);
  const CONFIRMED = new Set(["confirmed", "waiting", "checked_in"]);
  const ACTIVE = new Set(["pending", "pending_payment", "confirmed", "waiting", "checked_in", "in_progress"]);
  const c = {
    total_bookings: rows.length,
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
  for (const booking of rows) {
    const status = String(booking.status || "");
    const isAtHome = booking.location_type === "at_home";
    const isAtSalon = booking.location_type === "at_salon";
    if (ACTIVE.has(status)) c.active_bookings++;
    if (CONFIRMED.has(status)) {
      c.confirmed_bookings++;
      if (isAtHome) c.at_home_confirmed++;
      else if (isAtSalon) c.at_salon_confirmed++;
    } else if (PENDING.has(status)) {
      c.pending_bookings++;
      if (isAtHome) c.at_home_pending++;
      else if (isAtSalon) c.at_salon_pending++;
    } else {
      switch (status) {
        case "completed":
          c.completed_bookings++;
          if (isAtHome) c.at_home_completed++;
          else if (isAtSalon) c.at_salon_completed++;
          break;
        case "cancelled":
          c.cancelled_bookings++;
          if (isAtHome) c.at_home_cancelled++;
          else if (isAtSalon) c.at_salon_cancelled++;
          break;
        case "no_show":
          c.no_show_bookings++;
          if (isAtHome) c.at_home_no_show++;
          else if (isAtSalon) c.at_salon_no_show++;
          break;
      }
    }
    if (isAtHome) c.at_home_bookings++;
    else if (isAtSalon) c.at_salon_bookings++;
  }
  return c;
}

describe("provider_dashboard_snapshot parity (TS twin of migration 877 SQL)", () => {
  it("recognized-revenue windows match recognizedRevenueInRange with Node inclusive ends", () => {
    const ref = referenceRevenueWindows(ledger, windows);
    const node = {
      today: recognizedRevenueInRange(ledger, { start: windows.today.start, end: inclusiveEnd(windows.today.end) }),
      // Node: week/month revenue end at END OF TODAY (getDashboardRecognizedRevenueBounds).
      this_week: recognizedRevenueInRange(ledger, { start: windows.this_week.start, end: inclusiveEnd(windows.today.end) }),
      this_month: recognizedRevenueInRange(ledger, { start: windows.this_month.start, end: inclusiveEnd(windows.today.end) }),
      last_month: recognizedRevenueInRange(ledger, { start: windows.last_month.start, end: inclusiveEnd(windows.last_month.end) }),
      yesterday: recognizedRevenueInRange(ledger, { start: windows.yesterday.start, end: inclusiveEnd(windows.yesterday.end) }),
      prior_week: recognizedRevenueInRange(ledger, { start: windows.prior_week.start, end: inclusiveEnd(windows.prior_week.end) }),
      prior_month: recognizedRevenueInRange(ledger, { start: windows.prior_month.start, end: inclusiveEnd(windows.prior_month.end) }),
    };
    expect(ref).toEqual(node);
    // Sanity on the fixture itself (boundary + COALESCE + exclusions actually exercised).
    expect(ref.today).toBe(100); // 80 + 20 (net null → amount); travel_fee at exclusive end excluded
    expect(ref.yesterday).toBe(240);
    expect(ref.this_week).toBe(100 + 240 - 40);
    expect(ref.prior_week).toBe(25); // Mar 5 walk-in add-on excluded (past same-days)
    expect(ref.last_month).toBe(400 + 560 + 10 + 11);
    expect(ref.prior_month).toBe(400 + 10); // Feb 12 tip and Feb 20 earnings excluded
  });

  it("status tiles match the Node status loop", () => {
    expect(referenceBookingCounts(bookings)).toEqual(nodeStatusTiles(bookings));
    const ref = referenceBookingCounts(bookings);
    expect(ref.total_bookings).toBe(bookings.length);
    expect(ref.at_home_bookings + ref.at_salon_bookings).toBe(bookings.length - 1); // one null location_type
    expect(ref.active_bookings).toBe(6); // confirmed, pending_payment, in_progress, waiting, checked_in, pending
  });

  it("schedule counts match countBookingStatusInWindow(...).scheduled_total", () => {
    const ref = referenceScheduleCounts(bookings, windows);
    const node = (w: { start: Date; end: Date }) =>
      countBookingStatusInWindow(bookings, { start: w.start, end: inclusiveEnd(w.end) }).scheduled_total;
    expect(ref).toEqual({
      today: node(windows.today),
      this_week: node(windows.this_week),
      this_month: node(windows.this_month),
      yesterday: node(windows.yesterday),
      prior_week: node(windows.prior_week),
      prior_month: node(windows.prior_month),
    });
    expect(ref.today).toBe(2); // in_progress at exclusive end is tomorrow
    expect(ref.yesterday).toBe(1); // cancelled not counted
    expect(ref.prior_week).toBe(1);
    expect(ref.prior_month).toBe(1);
  });
});

describe("parseDashboardSnapshot", () => {
  it("coerces the RPC jsonb payload (numerics as strings, missing keys → 0)", () => {
    const parsed = parseDashboardSnapshot({
      version: 1,
      generated_at: "2026-03-11T10:00:00+00:00",
      tz: "Africa/Johannesburg",
      bookings: { total_bookings: "12", completed_bookings: 5, at_home_no_show: null },
      schedule: { today: "3", prior_week: 2 },
      revenue: { today: "123.45", last_month: "1000", prior_month: "12.5" },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.tz).toBe("Africa/Johannesburg");
    expect(parsed!.bookings.total_bookings).toBe(12);
    expect(parsed!.bookings.completed_bookings).toBe(5);
    expect(parsed!.bookings.at_home_no_show).toBe(0);
    expect(parsed!.bookings.cancelled_bookings).toBe(0);
    expect(parsed!.schedule).toEqual({ today: 3, this_week: 0, this_month: 0, yesterday: 0, prior_week: 2, prior_month: 0 });
    expect(parsed!.revenue.today).toBe(123.45);
    expect(parsed!.revenue.last_month).toBe(1000);
    expect(parsed!.revenue.prior_month).toBe(12.5);
    expect(parsed!.revenue.this_week).toBe(0);
  });

  it("returns null for non-object payloads", () => {
    expect(parseDashboardSnapshot(null)).toBeNull();
    expect(parseDashboardSnapshot("x")).toBeNull();
    expect(parseDashboardSnapshot([1])).toBeNull();
  });
});

describe("dashboard snapshot RPC wrapper + 30s cache", () => {
  const payload = {
    version: 1,
    tz: "UTC",
    bookings: { total_bookings: 4 },
    schedule: { today: 1 },
    revenue: { today: "10" },
  };

  beforeEach(() => {
    __resetDashboardSnapshotCacheForTests();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("flag is opt-in via DASHBOARD_SNAPSHOT_RPC=1", () => {
    expect(isDashboardSnapshotRpcEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isDashboardSnapshotRpcEnabled({ DASHBOARD_SNAPSHOT_RPC: "true" } as NodeJS.ProcessEnv)).toBe(false);
    expect(isDashboardSnapshotRpcEnabled({ DASHBOARD_SNAPSHOT_RPC: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("calls the RPC with provider/location/tz and returns ok:false on error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await fetchProviderDashboardSnapshot({ rpc } as never, {
      providerId: "prov-1",
      locationId: "loc-1",
      timezone: "Africa/Johannesburg",
    });
    expect(rpc).toHaveBeenCalledWith("provider_dashboard_snapshot", {
      p_provider_id: "prov-1",
      p_location_id: "loc-1",
      p_tz: "Africa/Johannesburg",
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toBe("boom");
  });

  it("second call within TTL is served from cache (RPC invoked once); key is provider+location scoped", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
    const params = { providerId: "prov-1", locationId: null, timezone: "UTC" };
    const first = await getProviderDashboardSnapshotCached({ rpc } as never, params);
    const second = await getProviderDashboardSnapshotCached({ rpc } as never, params);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(second.snapshot.bookings.total_bookings).toBe(4);
      expect(second.snapshot.revenue.today).toBe(10);
    }
    // Different location → different key → new RPC call.
    await getProviderDashboardSnapshotCached({ rpc } as never, { ...params, locationId: "loc-2" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(dashboardSnapshotCacheKey(params)).not.toBe(dashboardSnapshotCacheKey({ ...params, locationId: "loc-2" }));
  });

  it("does not cache failures", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "down" } })
      .mockResolvedValueOnce({ data: payload, error: null });
    const params = { providerId: "prov-9", locationId: null, timezone: "UTC" };
    const first = await getProviderDashboardSnapshotCached({ rpc } as never, params);
    const second = await getProviderDashboardSnapshotCached({ rpc } as never, params);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("honours a custom store (Upstash-shaped get/set) and TTL", async () => {
    const backing = new Map<string, unknown>();
    const store = {
      get: vi.fn(async (key: string) => (backing.get(key) as never) ?? null),
      set: vi.fn(async (key: string, snapshot: unknown) => {
        backing.set(key, snapshot);
      }),
    };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
    const params = { providerId: "prov-2", locationId: null, timezone: "UTC" };
    await getProviderDashboardSnapshotCached({ rpc } as never, params, { store, ttlSeconds: 30 });
    await getProviderDashboardSnapshotCached({ rpc } as never, params, { store, ttlSeconds: 30 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set.mock.calls[0][2]).toBe(30);
  });
});
