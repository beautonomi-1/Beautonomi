import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRefundCaps } from "@/lib/bookings/booking-refund-limits";

type Rows = Record<string, unknown[]>;

function fakeSupabase(rows: Rows): SupabaseClient {
  const from = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "not", "order", "limit"]) {
      builder[m] = () => builder;
    }
    builder.then = (resolve: (v: typeof result) => unknown) => resolve(result);
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

describe("computeRefundCaps", () => {
  it("cash-only booking has no wallet cap", async () => {
    const supabase = fakeSupabase({
      booking_payments: [{ id: "p1", amount: 300, payment_method: "cash", payment_provider: "cash", status: "completed" }],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: "c1", total_paid: 300, total_refunded: 0 });
    expect(caps.onlineCap).toBe(0);
    expect(caps.cashCap).toBe(300);
    expect(caps.terminalCap).toBe(0);
    expect(caps.suggestedMethod).toBe("cash");
  });

  it("card machine booking has terminal cap and no wallet cap", async () => {
    const supabase = fakeSupabase({
      booking_payments: [{ id: "p1", amount: 250, payment_method: "card", payment_provider: "paycloud", status: "completed" }],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: "c1", total_paid: 250, total_refunded: 0 });
    expect(caps.onlineCap).toBe(0);
    expect(caps.terminalCap).toBe(250);
    expect(caps.suggestedMethod).toBe("original");
  });

  it("mixed booking caps the wallet at the online share", async () => {
    const supabase = fakeSupabase({
      booking_payments: [
        { id: "p1", amount: 100, payment_method: "card", payment_provider: "paystack", status: "completed" },
        { id: "p2", amount: 200, payment_method: "cash", payment_provider: "cash", status: "completed" },
      ],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: "c1", total_paid: 300, total_refunded: 0 });
    expect(caps.onlineCap).toBe(100);
    expect(caps.cashCap).toBe(200);
    expect(caps.maxRefundable).toBe(300);
    expect(caps.suggestedMethod).toBe("store_credit");
  });

  it("prior store-credit refunds reduce the wallet cap", async () => {
    const supabase = fakeSupabase({
      booking_payments: [{ id: "p1", amount: 100, payment_method: "card", payment_provider: "paystack", status: "completed" }],
      booking_refunds: [{ amount: 60, refund_method: "store_credit", status: "completed", payment_id: null }],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: "c1", total_paid: 100, total_refunded: 60 });
    expect(caps.onlineCap).toBe(40);
  });

  it("gateway refunds linked to an online payment reduce the wallet cap", async () => {
    const supabase = fakeSupabase({
      booking_payments: [{ id: "p1", amount: 100, payment_method: "card", payment_provider: "paystack", status: "completed" }],
      booking_refunds: [{ amount: 100, refund_method: "original", status: "completed", payment_id: "p1" }],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: "c1", total_paid: 100, total_refunded: 100 });
    expect(caps.onlineCap).toBe(0);
    expect(caps.maxRefundable).toBe(0);
  });

  it("legacy wallet/gift coverage without payment rows still allows a wallet refund", async () => {
    const supabase = fakeSupabase({ booking_payments: [] });
    const caps = await computeRefundCaps(supabase, "b1", {
      customer_id: "c1",
      total_paid: 0,
      total_refunded: 0,
      wallet_amount: 50,
      gift_card_amount: 25,
    });
    expect(caps.onlineCap).toBe(75);
    expect(caps.maxRefundable).toBe(75);
  });

  it("walk-in without a customer account is never offered wallet", async () => {
    const supabase = fakeSupabase({
      booking_payments: [{ id: "p1", amount: 100, payment_method: "card", payment_provider: "paystack", status: "completed" }],
    });
    const caps = await computeRefundCaps(supabase, "b1", { customer_id: null, total_paid: 100, total_refunded: 0 });
    expect(caps.hasCustomerAccount).toBe(false);
    expect(caps.suggestedMethod).not.toBe("store_credit");
  });
});
