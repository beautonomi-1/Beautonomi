import {
  formatGroupPaymentStatusLabel,
  groupIsFullyPaid,
  isSingleChargeOnlineGroup,
  participantMaxRefundable,
} from "@/lib/group-booking-detail-helpers";

describe("group-booking-detail-helpers", () => {
  it("groupIsFullyPaid uses group-level payment_status", () => {
    expect(groupIsFullyPaid({ payment_status: "paid", is_invoiced: true })).toBe(true);
    expect(
      groupIsFullyPaid({ payment_status: "partially_paid", balance_due: 10, is_invoiced: true })
    ).toBe(false);
    expect(groupIsFullyPaid({ payment_status: "paid", balance_due: 0, is_invoiced: true })).toBe(
      true
    );
  });

  it("participantMaxRefundable matches wallet/gift server cap", () => {
    expect(
      participantMaxRefundable({ total_paid: 50, total_refunded: 10, wallet_gift_coverage: 80 })
    ).toBe(70);
    expect(
      participantMaxRefundable({ total_paid: 100, total_refunded: 20, wallet_gift_coverage: 0 })
    ).toBe(80);
  });

  it("detects single-charge online group refund context", () => {
    const participants = [
      { id: "p1", booking_id: "b1", is_primary_contact: true },
      { id: "p2", booking_id: null },
      { id: "p3", booking_id: null },
    ];
    expect(isSingleChargeOnlineGroup(participants, "p1")).toBe(true);
    expect(isSingleChargeOnlineGroup(participants, "p2")).toBe(false);
  });

  it("formats payment status labels", () => {
    expect(formatGroupPaymentStatusLabel("not_invoiced")).toBe("Not invoiced");
    expect(formatGroupPaymentStatusLabel("paid")).toBe("Paid in full");
  });
});
