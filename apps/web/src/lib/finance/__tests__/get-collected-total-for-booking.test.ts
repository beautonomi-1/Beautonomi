import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCollectedTotalForBooking } from "../get-collected-total-for-booking";

function mockSupabase(opts: {
  payment_transactions: { amount: number; transaction_type?: string }[];
  booking_refunds: { amount: number }[];
}): SupabaseClient {
  return {
    from(table: string) {
      const data = table === "payment_transactions" ? opts.payment_transactions : opts.booking_refunds;
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data, error: null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("getCollectedTotalForBooking", () => {
  it("sums only charge-like inflows and subtracts completed refunds", async () => {
    const supabase = mockSupabase({
      payment_transactions: [
        { amount: 200, transaction_type: "charge" },
        { amount: 999, transaction_type: "wallet_topup" },
      ],
      booking_refunds: [{ amount: 50 }],
    });
    await expect(getCollectedTotalForBooking(supabase, "b1")).resolves.toBe(150);
  });
});
