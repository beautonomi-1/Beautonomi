import { describe, expect, it } from "vitest";
import { buildRefundQueueRows } from "../refund-queue-rows";
import type { RefundListRow } from "../refund-list-normalize";

function baseRow(overrides: Partial<RefundListRow> = {}): RefundListRow {
  return {
    id: "tx-1",
    booking_id: "booking-1",
    transaction_type: "charge",
    amount: 200,
    refund_amount: 0,
    status: "success",
    created_at: "2026-01-01T00:00:00Z",
    provider: "paystack",
    metadata: null,
    booking: {
      id: "booking-1",
      booking_number: "BK-1",
      status: "cancelled",
      payment_status: "paid",
      total_paid: 200,
      total_refunded: 0,
    },
    booking_refunds: [],
    ...overrides,
  } as RefundListRow;
}

describe("buildRefundQueueRows", () => {
  it("groups gateway captures per booking with tender label", () => {
    const rows = buildRefundQueueRows([baseRow()], {
      disputesByBookingId: new Set(),
      ticketsByBookingId: new Set(),
      coverageByBookingId: new Map(),
      additionalChargesById: new Map(),
      bookingPaymentsByBookingId: new Map([
        [
          "booking-1",
          [{ payment_provider: "paystack", payment_method: "card", amount: 200 }],
        ],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("gateway_capture");
    expect(rows[0]?.captures).toHaveLength(1);
    expect(rows[0]?.tender_label).toContain("Paystack");
  });

  it("uses booking_tender when capture amount is zero but payments exist", () => {
    const row = baseRow({
      id: "booking-tender:booking-1",
      amount: 0,
      metadata: { kind: "booking_tender_only" },
      booking: {
        id: "booking-1",
        booking_number: "BK-1",
        status: "cancelled",
        payment_status: "paid",
        total_paid: 150,
        total_refunded: 0,
      },
    });

    const rows = buildRefundQueueRows([row], {
      disputesByBookingId: new Set(),
      ticketsByBookingId: new Set(),
      coverageByBookingId: new Map(),
      additionalChargesById: new Map(),
      bookingPaymentsByBookingId: new Map([
        [
          "booking-1",
          [{ payment_provider: "cash", payment_method: "cash", amount: 150 }],
        ],
      ]),
    });

    expect(rows[0]?.source).toBe("booking_tender");
    expect(rows[0]?.collected).toBe(150);
    expect(rows[0]?.primary_transaction_id).toBeNull();
  });
});
