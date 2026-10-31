import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backfillCancelledCashRefundObligations } from "../backfill-cancelled-cash-refund-obligations";

vi.mock("@/lib/bookings/cancellation-cash-refund-obligation", () => ({
  ensureCancellationCashRefundObligation: vi.fn(),
}));

import { ensureCancellationCashRefundObligation } from "@/lib/bookings/cancellation-cash-refund-obligation";

describe("backfillCancelledCashRefundObligations", () => {
  it("only backfills cancelled_unrefunded queue rows", async () => {
    vi.mocked(ensureCancellationCashRefundObligation)
      .mockResolvedValueOnce({ inPersonCashRefundDue: 50, created: true, refundId: "x" })
      .mockResolvedValueOnce({ inPersonCashRefundDue: 0, created: false, refundId: null });

    const created = await backfillCancelledCashRefundObligations({} as SupabaseClient, "tenant-1", [
      {
        queue_reason: "cancelled_unrefunded",
        booking_id: "b1",
        booking: { provider_id: "p1", customer_id: "c1" },
      } as never,
      {
        queue_reason: "awaiting_cash_confirmation",
        booking_id: "b2",
        booking: { provider_id: "p1" },
      } as never,
    ]);

    expect(created).toBe(1);
    expect(ensureCancellationCashRefundObligation).toHaveBeenCalledTimes(1);
  });
});
