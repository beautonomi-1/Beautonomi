import { describe, expect, it, vi } from "vitest";
import { countUnrecognizedPaymentsToday } from "../count-unrecognized-payments-today";

function paymentsQuery(result: { data: unknown; error?: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          gte: () => ({
            lte: () => ({
              range: () => Promise.resolve(result),
            }),
          }),
        }),
      }),
    }),
  };
}

function ledgerQuery(result: { data: unknown; error?: unknown }) {
  return {
    select: () => ({
      in: () => ({
        eq: () => Promise.resolve(result),
      }),
    }),
  };
}

describe("countUnrecognizedPaymentsToday", () => {
  it("returns 0 when no online payments today", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") return paymentsQuery({ data: [] });
        if (table === "finance_transactions") return ledgerQuery({ data: [] });
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const count = await countUnrecognizedPaymentsToday(
      supabase as never,
      "provider-1",
      "Africa/Johannesburg",
    );
    expect(count).toBe(0);
    expect(supabase.from).not.toHaveBeenCalledWith("bookings");
  });

  it("returns 0 when the payments query errors instead of throwing", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") {
          return paymentsQuery({
            data: null,
            error: { message: "URI too long", code: "PGRST100" },
          });
        }
        throw new Error(`unexpected table ${table}`);
      }),
    };

    await expect(
      countUnrecognizedPaymentsToday(supabase as never, "provider-1", "Africa/Johannesburg"),
    ).resolves.toBe(0);
  });

  it("counts a completed online payment with no ledger payment row", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "booking_payments") {
          return paymentsQuery({
            data: [
              {
                id: "pay-1",
                booking_id: "booking-1",
                payment_method: "card",
                payment_provider: "paystack",
              },
              {
                id: "pay-cash",
                booking_id: "booking-2",
                payment_method: "cash",
                payment_provider: "cash",
              },
            ],
          });
        }
        if (table === "finance_transactions") return ledgerQuery({ data: [] });
        throw new Error(`unexpected table ${table}`);
      }),
    };

    const count = await countUnrecognizedPaymentsToday(
      supabase as never,
      "provider-1",
      "Africa/Johannesburg",
    );
    expect(count).toBe(1);
  });
});
