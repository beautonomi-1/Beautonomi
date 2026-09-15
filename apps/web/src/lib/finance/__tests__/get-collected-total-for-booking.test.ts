import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCollectedTotalForBooking } from "../get-collected-total-for-booking";

function mockSupabase(opts: {
  payment_transactions: {
    amount: number;
    refund_amount?: number;
    transaction_type?: string;
    status?: string;
  }[];
  booking_refunds: { amount: number }[];
}): SupabaseClient {
  return {
    from(table: string) {
      const data = table === "payment_transactions" ? opts.payment_transactions : opts.booking_refunds;
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data, error: null }),
            eq: () => Promise.resolve({ data, error: null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("getCollectedTotalForBooking", () => {
  it("sums net charge-like gateway inflows", async () => {
    const supabase = mockSupabase({
      payment_transactions: [
        { amount: 200, transaction_type: "charge" },
        { amount: 999, transaction_type: "wallet_topup" },
      ],
      booking_refunds: [{ amount: 50 }],
    });
    await expect(getCollectedTotalForBooking(supabase, "b1")).resolves.toBe(200);
  });

  it("nets partially_refunded gateway rows instead of dropping them", async () => {
    const supabase = mockSupabase({
      payment_transactions: [
        {
          amount: 200,
          refund_amount: 50,
          transaction_type: "charge",
          status: "partially_refunded",
        },
      ],
      booking_refunds: [{ amount: 50 }],
    });
    await expect(getCollectedTotalForBooking(supabase, "b1")).resolves.toBe(150);
  });
});
