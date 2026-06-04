import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildServiceLedgerPerformance } from "../service-ledger-performance";

const getProviderRevenueMock = vi.fn();

vi.mock("@/lib/reports/revenue-helpers", () => ({
  getProviderRevenue: (...args: unknown[]) => getProviderRevenueMock(...args),
}));

describe("buildServiceLedgerPerformance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProviderRevenueMock.mockResolvedValue({
      revenueByBooking: new Map([["b1", 100]]),
    });
  });

  it("allocates ledger net by line price share for completed bookings", async () => {
    const bookings = [
      {
        id: "b1",
        booking_services: [
          { price: 60, offering_id: "o1", offerings: { id: "o1", title: "Cut" } },
          { price: 40, offering_id: "o2", offerings: { id: "o2", title: "Color" } },
        ],
      },
    ];

    const supabase = {
      from: (table: string) => {
        if (table !== "bookings") throw new Error(`unexpected ${table}`);
        const chain = {
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          not: () => chain,
          then: (fn: (v: { data: typeof bookings; error: null }) => void) =>
            Promise.resolve(fn({ data: bookings, error: null })),
        };
        return chain;
      },
    };

    const rows = await buildServiceLedgerPerformance(
      supabase as never,
      "prov-1",
      new Date("2026-01-01"),
      new Date("2026-01-31"),
      null,
      "UTC",
      { status: "completed" },
    );

    expect(rows).toHaveLength(2);
    const cut = rows.find((r) => r.serviceName === "Cut");
    const color = rows.find((r) => r.serviceName === "Color");
    expect(cut?.revenue).toBe(60);
    expect(color?.revenue).toBe(40);
    expect(cut?.bookingCount).toBe(1);
  });
});
