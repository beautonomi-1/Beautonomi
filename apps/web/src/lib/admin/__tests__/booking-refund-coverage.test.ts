import { describe, it, expect, vi } from "vitest";
import { backfillPaymentTransactionFromBookingRefunds } from "../booking-refund-coverage";

vi.mock("@/lib/finance/sync-payment-transaction-refund", () => ({
  syncPaymentTransactionRefundState: vi.fn(async (opts: { cumulativeRefundAmount: number }) => ({
    synced: true,
    transactionId: "tx-1",
    cumulativeRefundAmount: opts.cumulativeRefundAmount,
  })),
}));

import { syncPaymentTransactionRefundState } from "@/lib/finance/sync-payment-transaction-refund";

describe("backfillPaymentTransactionFromBookingRefunds", () => {
  it("caps backfill to the charge amount", async () => {
    const supabase = {} as import("@supabase/supabase-js").SupabaseClient;
    await backfillPaymentTransactionFromBookingRefunds({
      supabase,
      bookingId: "b-1",
      transactionId: "tx-1",
      txnAmount: 50,
      txnRefundedAmount: 0,
      coverage: {
        walletCreditedTotal: 208,
        bookingTotalRefunded: 208,
        effectiveRefundedTotal: 208,
        bookingRefunds: [
          {
            id: "br-1",
            booking_id: "b-1",
            amount: 208,
            reason: "Cancellation refund",
            refund_method: "store_credit",
            status: "completed",
          },
        ],
      },
    });

    expect(syncPaymentTransactionRefundState).toHaveBeenCalledWith(
      expect.objectContaining({
        cumulativeRefundAmount: 50,
      }),
    );
  });
});
