import { describe, expect, it } from "vitest";
import type { RefundQueueRow } from "@/lib/admin/refund-queue-rows";
import { queueRowSkipsAutoCredit } from "@/lib/finance/run-auto-wallet-credit-exceptions";

function baseRow(overrides: Partial<RefundQueueRow>): RefundQueueRow {
  return {
    key: "k",
    source: "gateway_capture",
    booking_id: "b1",
    booking: {},
    tender_label: "Card (Paystack)",
    collected: 100,
    refunded: 0,
    remaining_refundable: 100,
    reserved: 0,
    queue_reason: "cancelled_unrefunded",
    queue_reason_detail: null,
    queue_reason_label: "Cancelled",
    needs_action: true,
    is_processable: true,
    captures: [],
    primary_transaction_id: "tx1",
    ...overrides,
  };
}

describe("auto wallet credit skip rules", () => {
  it("allows Paystack-only processable cancelled_unrefunded", () => {
    expect(queueRowSkipsAutoCredit(baseRow({}))).toBe(false);
  });

  it("skips cash, terminal, mixed, and gift-card bookings", () => {
    expect(queueRowSkipsAutoCredit(baseRow({ tender_label: "Cash" }))).toBe(true);
    expect(queueRowSkipsAutoCredit(baseRow({ tender_label: "Card machine (Yoco)" }))).toBe(true);
    expect(queueRowSkipsAutoCredit(baseRow({ tender_label: "Mixed" }))).toBe(true);
    expect(queueRowSkipsAutoCredit(baseRow({ booking: { gift_card_amount: 20 } }))).toBe(true);
    expect(queueRowSkipsAutoCredit(baseRow({ queue_reason: "kept_per_policy" }))).toBe(true);
  });
});
