import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyBookingPaymentTip } from "../increment-booking-tip";

function makeSupabase(opts: {
  rpcError?: { message: string } | null;
  bookingTip?: number | null;
  applications?: Array<{ tip_amount: number }>;
}) {
  const rpc = vi.fn(async () => ({ data: true, error: opts.rpcError ?? null }));
  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: opts.bookingTip === null ? null : { tip_amount: opts.bookingTip ?? 0 },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "booking_tip_applications") {
      return {
        select: () => ({
          eq: async () => ({ data: opts.applications ?? [], error: null }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { supabase: { rpc, from } as unknown as SupabaseClient, rpc };
}

describe("applyBookingPaymentTip", () => {
  it("calls the idempotent RPC with the payment id and the rounded tip", async () => {
    const { supabase, rpc } = makeSupabase({ bookingTip: 60, applications: [{ tip_amount: 25 }] });
    await applyBookingPaymentTip(supabase, "b-1", "bp-1", 25.004);
    expect(rpc).toHaveBeenCalledWith("apply_booking_payment_tip", {
      p_booking_payment_id: "bp-1",
      p_tip_amount: 25,
    });
  });

  it("returns the checkout tip by excluding every per-payment tip", async () => {
    const { supabase } = makeSupabase({
      bookingTip: 70,
      applications: [{ tip_amount: 25 }, { tip_amount: 10 }],
    });
    await expect(applyBookingPaymentTip(supabase, "b-1", "bp-2", 10)).resolves.toEqual({
      bookingLevelTip: 35,
    });
  });

  it("returns the same result on a retry where the RPC no longer increments", async () => {
    const { supabase } = makeSupabase({ bookingTip: 60, applications: [{ tip_amount: 25 }] });
    const first = await applyBookingPaymentTip(supabase, "b-1", "bp-1", 25);
    const retry = await applyBookingPaymentTip(supabase, "b-1", "bp-1", 25);
    expect(first).toEqual({ bookingLevelTip: 35 });
    expect(retry).toEqual(first);
  });

  it("throws when the RPC fails so the webhook is retried", async () => {
    const { supabase } = makeSupabase({ rpcError: { message: "boom" } });
    await expect(applyBookingPaymentTip(supabase, "b-1", "bp-1", 25)).rejects.toThrow(
      /apply_booking_payment_tip failed/,
    );
  });

  it("throws when the booking cannot be read back", async () => {
    const { supabase } = makeSupabase({ bookingTip: null });
    await expect(applyBookingPaymentTip(supabase, "b-1", "bp-1", 25)).rejects.toThrow(/Failed to read booking/);
  });
});
