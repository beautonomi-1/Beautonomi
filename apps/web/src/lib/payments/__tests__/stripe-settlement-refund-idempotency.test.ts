import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockSupabase,
}));

const mockSupabase = {
  from: vi.fn(),
};

describe("handleStripeRefundCreated idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "payment_transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: "existing-refund" } }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn(), insert: vi.fn() };
    });
  });

  it("skips when refund payment_transaction already exists", async () => {
    const { handleStripeRefundCreated } = await import("../stripe-settlement");
    await handleStripeRefundCreated({
      id: "re_123",
      payment_intent: "pi_123",
      amount: 5000,
      currency: "zar",
    });
    const insertCalls = mockSupabase.from.mock.results.filter(
      (r) => r.value && typeof r.value.insert === "function",
    );
    expect(insertCalls.length).toBe(0);
  });
});

describe("handleStripeChargeRefundedBackstop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when refund.created rows (re_*) already exist", async () => {
    const inserts: unknown[] = [];
    const priorRefunds = [{ amount: 50, refund_provider_id: "re_partial" }];

    mockSupabase.from.mockImplementation((table: string) => {
      if (table !== "booking_refunds") {
        return { select: vi.fn(), insert: vi.fn() };
      }

      class BookingRefundsQuery {
        private mode: "idempotency" | "list" = "idempotency";

        select() {
          return this;
        }
        eq(col: string) {
          if (col === "status") this.mode = "list";
          return this;
        }
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        }
        then(resolve: (v: { data: typeof priorRefunds; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: priorRefunds, error: null }));
        }
        insert(row: unknown) {
          inserts.push(row);
          return Promise.resolve({ data: row, error: null });
        }
      }

      return new BookingRefundsQuery();
    });

    const { handleStripeChargeRefundedBackstop } = await import("../stripe-settlement");
    await handleStripeChargeRefundedBackstop({
      id: "ch_1",
      payment_intent: "pi_1",
      amount_refunded: 5000,
      currency: "zar",
      metadata: { booking_id: "booking-1" },
    });

    expect(inserts).toHaveLength(0);
  });
});
