import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockFetchAllLedgerPages = vi.fn();
const mockFilterLedgerRowsForLocation = vi.fn();

vi.mock("@/lib/reports/fetch-all-ledger-pages", () => ({
  fetchAllLedgerPages: (...args: unknown[]) => mockFetchAllLedgerPages(...args),
}));

vi.mock("@/lib/reports/provider-report-utils", () => ({
  filterLedgerRowsForLocation: (...args: unknown[]) => mockFilterLedgerRowsForLocation(...args),
}));

vi.mock("@/lib/reports/provider-revenue-semantics", () => ({
  RECOGNIZED_REVENUE_TYPES: ["booking_payment"],
  recognizedRevenueInRange: () => 42,
}));

const VALID_BOOKING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "in_progress",
  "waiting",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
]);

const INVALID_BOOKING_STATUSES = new Set(["started", "canceled", "booked"]);

type StatusFilterCall = { table: string; statuses: string[] };

function makeCountChain(count: number, onIn?: (statuses: string[]) => void) {
  const chain: any = {
    eq: () => chain,
    in: (_col: string, statuses: string[]) => {
      onIn?.(statuses);
      return chain;
    },
    is: () => chain,
    or: () => chain,
    gte: () => chain,
    lte: () => chain,
    select: () => chain,
    order: () => chain,
    range: () => chain,
    then: (resolve: (v: unknown) => void) => resolve({ count, error: null, data: [] }),
  };
  return chain;
}

function makeAdmin(options?: { bookingStatusFilters?: StatusFilterCall[]; count?: number }) {
  const bookingStatusFilters = options?.bookingStatusFilters ?? [];
  const count = options?.count ?? 2;

  return {
    from(table: string) {
      if (table === "providers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { timezone: "Africa/Johannesburg" }, error: null }),
            }),
          }),
        };
      }
      if (table === "finance_transactions") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          gte: () => chain,
          lte: () => chain,
        };
        return chain;
      }
      return makeCountChain(count, (statuses) => {
        bookingStatusFilters.push({ table, statuses: [...statuses] });
      });
    },
  } as unknown as SupabaseClient;
}

describe("computeBookingsStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAllLedgerPages.mockResolvedValue([]);
    mockFilterLedgerRowsForLocation.mockResolvedValue([]);
  });

  it("reconciles appointment_count from status buckets", async () => {
    const admin = makeAdmin();

    const { computeBookingsStats } = await import("@/lib/server/provider/bookings-stats");
    const stats = await computeBookingsStats(admin, "provider-1", "all");

    expect(stats.appointment_count).toBe(
      stats.pending_count + stats.confirmed_count + stats.in_progress_count + stats.completed_count,
    );
    expect(stats.recognized_revenue).toBe(42);
    expect(stats.cancelled_count).toBeGreaterThanOrEqual(0);
    expect(stats.no_show_count).toBeGreaterThanOrEqual(0);
  });

  it("never filters bookings.status with invalid enum aliases", async () => {
    const bookingStatusFilters: StatusFilterCall[] = [];
    const admin = makeAdmin({ bookingStatusFilters });

    const { computeBookingsStats } = await import("@/lib/server/provider/bookings-stats");
    await computeBookingsStats(admin, "provider-1", "today");

    const bookingFilters = bookingStatusFilters.filter((f) => f.table === "bookings");
    expect(bookingFilters.length).toBeGreaterThan(0);

    for (const filter of bookingFilters) {
      for (const status of filter.statuses) {
        expect(INVALID_BOOKING_STATUSES.has(status)).toBe(false);
        expect(VALID_BOOKING_STATUSES.has(status)).toBe(true);
      }
    }
  });

  it("aggregates across today, week, month, and all ranges", async () => {
    const admin = makeAdmin({ count: 3 });
    const { computeBookingsStats } = await import("@/lib/server/provider/bookings-stats");

    for (const range of ["today", "week", "month", "all"] as const) {
      const stats = await computeBookingsStats(admin, "provider-1", range);
      expect(stats.range).toBe(range);
      expect(stats.appointment_count).toBeGreaterThan(0);
      expect(stats.timezone).toBeTruthy();
    }
  });

  it("returns zeroed stats when calendar-scoped staff has no matching bookings", async () => {
    const admin = makeAdmin({ count: 9 });
    const { computeBookingsStats } = await import("@/lib/server/provider/bookings-stats");
    const stats = await computeBookingsStats(admin, "provider-1", "all", null, "staff-1");

    expect(stats.appointment_count).toBe(0);
    expect(stats.booked_gmv).toBe(0);
    expect(stats.recognized_revenue).toBe(0);
    expect(stats.pending_count).toBe(0);
    expect(stats.confirmed_count).toBe(0);
  });
});
