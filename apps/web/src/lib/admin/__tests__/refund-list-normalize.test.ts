import { describe, it, expect } from "vitest";
import {
  enrichRefundListRow,
  enrichRefundListRows,
  countActionableRefundable,
  remainingRefundableAmount,
} from "../refund-list-normalize";

describe("remainingRefundableAmount", () => {
  it("computes remaining balance", () => {
    expect(remainingRefundableAmount(100, 40)).toBe(60);
    expect(remainingRefundableAmount(100, 100)).toBe(0);
  });
});

describe("enrichRefundListRow", () => {
  it("marks booking-linked success rows as processable", () => {
    const row = enrichRefundListRow({
      id: "tx-1",
      status: "success",
      amount: 200,
      refund_amount: 0,
      booking: { id: "b-1", booking_number: "BK-1" },
    });
    expect(row.remaining_refundable).toBe(200);
    expect(row.payout_method).toBeNull();
    expect(row.is_processable).toBe(true);
    expect(row.refund_state).toBe("not_refunded");
  });

  it("marks wallet-credited bookings as not processable", () => {
    const row = enrichRefundListRow(
      {
        id: "tx-2",
        status: "success",
        amount: 208,
        refund_amount: 0,
        booking: { id: "b-1" },
      },
      [
        {
          id: "br-1",
          booking_id: "b-1",
          amount: 208,
          reason: "Cancellation refund (late cancellation)",
          refund_method: "store_credit",
          status: "completed",
        },
      ],
    );
    expect(row.remaining_refundable).toBe(0);
    expect(row.is_processable).toBe(false);
    expect(row.refund_state).toBe("credited_elsewhere");
    expect(row.effective_reason).toBe("Cancellation refund (late cancellation)");
    expect(row.payout_method).toBe("wallet");
  });

  it("marks partially_refunded rows with remaining balance as processable", () => {
    const row = enrichRefundListRow({
      id: "tx-2",
      status: "partially_refunded",
      amount: 200,
      refund_amount: 50,
      booking: { id: "b-1" },
    });
    expect(row.remaining_refundable).toBe(150);
    expect(row.is_processable).toBe(true);
  });

  it("rejects orphan rows without booking", () => {
    const row = enrichRefundListRow({
      id: "tx-3",
      status: "success",
      amount: 100,
      booking: null,
    });
    expect(row.is_processable).toBe(false);
    expect(row.refund_state).toBe("not_applicable");
  });

  it("caps effective refunded at charge amount", () => {
    const row = enrichRefundListRow(
      {
        id: "tx-4",
        status: "success",
        amount: 200,
        refund_amount: 0,
        booking: { id: "b-1", total_refunded: 250 },
      },
      [
        {
          id: "br-1",
          booking_id: "b-1",
          amount: 250,
          reason: "Cancellation refund",
          refund_method: "store_credit",
          status: "completed",
        },
      ],
      200,
    );
    expect(row.effective_refunded_total).toBe(200);
    expect(row.remaining_refundable).toBe(0);
    expect(row.is_processable).toBe(false);
  });

  it("allocates booking wallet across multiple charge rows", () => {
    const rows = enrichRefundListRows([
      {
        id: "primary",
        status: "success",
        amount: 200,
        refund_amount: 0,
        transaction_type: "charge",
        booking_id: "b-1",
        created_at: "2026-01-01",
        booking: { id: "b-1", total_refunded: 220 },
        booking_refunds: [
          {
            id: "br-1",
            booking_id: "b-1",
            amount: 220,
            reason: "Cancellation refund",
            refund_method: "store_credit",
            status: "completed",
          },
        ],
      },
      {
        id: "extra",
        status: "success",
        amount: 50,
        refund_amount: 0,
        transaction_type: "additional_charge",
        booking_id: "b-1",
        created_at: "2026-01-02",
        booking: { id: "b-1", total_refunded: 220 },
        booking_refunds: [
          {
            id: "br-1",
            booking_id: "b-1",
            amount: 220,
            reason: "Cancellation refund",
            refund_method: "store_credit",
            status: "completed",
          },
        ],
      },
    ]);

    const primary = rows.find((r) => r.id === "primary")!;
    const extra = rows.find((r) => r.id === "extra")!;
    expect(primary.remaining_refundable).toBe(0);
    expect(extra.remaining_refundable).toBe(30);
    expect(extra.is_processable).toBe(true);
  });
});

describe("countActionableRefundable", () => {
  it("counts only processable rows", () => {
    const rows = [
      enrichRefundListRow({ id: "1", status: "success", amount: 10, booking: {} }),
      enrichRefundListRow({ id: "2", status: "refunded", amount: 10, refund_amount: 10, booking: {} }),
      enrichRefundListRow({ id: "3", status: "success", amount: 10, booking: null }),
    ];
    expect(countActionableRefundable(rows)).toBe(1);
  });
});
