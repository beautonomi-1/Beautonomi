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

function makeCountChain(count: number) {
  const chain: any = {
    eq: () => chain,
    in: () => chain,
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

describe("computeBookingsStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAllLedgerPages.mockResolvedValue([]);
    mockFilterLedgerRowsForLocation.mockResolvedValue([]);
  });

  it("reconciles appointment_count from status buckets", async () => {
    const admin = {
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
        return makeCountChain(2);
      },
    } as unknown as SupabaseClient;

    const { computeBookingsStats } = await import("@/lib/server/provider/bookings-stats");
    const stats = await computeBookingsStats(admin, "provider-1", "all");

    expect(stats.appointment_count).toBe(
      stats.pending_count + stats.confirmed_count + stats.in_progress_count + stats.completed_count,
    );
    expect(stats.recognized_revenue).toBe(42);
    expect(stats.cancelled_count).toBeGreaterThanOrEqual(0);
    expect(stats.no_show_count).toBeGreaterThanOrEqual(0);
  });
});
