import { describe, expect, it } from "vitest";
import { chunkBookingIds, REFUND_BOOKING_ID_CHUNK } from "@/lib/admin/refund-needs-action-pipeline";
import { countRefundsNeedingReviewFromQueue } from "@/lib/admin/refund-queue-rows";
import type { RefundQueueRow } from "@/lib/admin/refund-queue-rows";

describe("refund-needs-action-pipeline", () => {
  it("chunks booking ids for batched payment_transaction queries", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `b-${i}`);
    const chunks = chunkBookingIds(ids);
    expect(chunks.length).toBe(Math.ceil(250 / REFUND_BOOKING_ID_CHUNK));
    expect(chunks[0]?.length).toBe(REFUND_BOOKING_ID_CHUNK);
    expect(chunks.flat()).toEqual(ids);
  });

  it("counts needs_action rows via countRefundsNeedingReviewFromQueue (not raw booking id sets)", () => {
    const rows: RefundQueueRow[] = [
      {
        key: "a",
        source: "gateway_capture",
        booking_id: "b-dispute",
        booking: {},
        tender_label: "Card (Paystack)",
        collected: 100,
        refunded: 0,
        remaining_refundable: 100,
        reserved: 0,
        queue_reason: "open_dispute",
        queue_reason_detail: null,
        queue_reason_label: "Open dispute",
        needs_action: true,
        is_processable: true,
        captures: [],
        primary_transaction_id: "tx1",
      },
    ];
    expect(countRefundsNeedingReviewFromQueue(rows)).toBe(1);
  });
});
