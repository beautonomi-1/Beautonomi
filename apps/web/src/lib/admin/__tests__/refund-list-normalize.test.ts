import { describe, it, expect } from "vitest";
import {
  enrichRefundListRow,
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
    expect(row.payout_method).toBe("wallet");
    expect(row.is_processable).toBe(true);
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
  });
});

describe("countActionableRefundable", () => {
  it("counts only processable rows", () => {
    const rows = [
      enrichRefundListRow({ id: "1", status: "success", amount: 10, booking: {} }),
      enrichRefundListRow({ id: "2", status: "refunded", amount: 10, booking: {} }),
      enrichRefundListRow({ id: "3", status: "success", amount: 10, booking: null }),
    ];
    expect(countActionableRefundable(rows)).toBe(1);
  });
});
