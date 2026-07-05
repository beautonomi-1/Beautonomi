import {
  computeGroupFinancialBreakdown,
  countGroupParticipantsCheckedIn,
  formatGroupPaymentStatusLabel,
  groupIsFullyPaid,
  isGroupParticipantCheckedIn,
  isSingleChargeOnlineGroup,
  participantMaxRefundable,
  resolveGroupParticipantCount,
  shouldRejectStaleListPaymentSync,
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

  it("resolveGroupParticipantCount prefers participants array length", () => {
    expect(
      resolveGroupParticipantCount({
        current_participants: 0,
        participants: [{ id: "p1" }, { id: "p2" }],
      })
    ).toBe(2);
    expect(resolveGroupParticipantCount({ current_participants: 3, participants: [] })).toBe(0);
    expect(resolveGroupParticipantCount({ current_participants: 2 })).toBe(2);
  });

  it("counts checked-in participants from mixed flags", () => {
    const participants = [
      { id: "p1", checked_in: true },
      { id: "p2", checked_in_at: "2026-06-16T10:00:00.000Z" },
      { id: "p3" },
    ];
    expect(countGroupParticipantsCheckedIn(participants)).toBe(2);
    expect(isGroupParticipantCheckedIn({ id: "p4", checked_in_time: "2026-06-16T10:00:00.000Z" })).toBe(
      true
    );
  });

  it("computeGroupFinancialBreakdown sums services, travel, products, and charges", () => {
    const breakdown = computeGroupFinancialBreakdown({
      location_type: "at_home",
      travel_fee: 80,
      total_price: 380,
      package_discount_amount: 20,
      participants: [
        { price: 150, tip_amount: 10 },
        { price: 120, tip_amount: 0 },
      ],
      products: [{ unit_price: 30, quantity: 1 }],
      bookings: [
        {
          additional_charges: [{ amount: 20, status: "pending" }],
        },
      ],
    });
    expect(breakdown.participantServicesTotal).toBe(270);
    expect(breakdown.travelFee).toBe(80);
    expect(breakdown.productsTotal).toBe(30);
    expect(breakdown.tipsTotal).toBe(10);
    expect(breakdown.packageDiscount).toBe(20);
    expect(breakdown.additionalChargesTotal).toBe(20);
    expect(breakdown.total).toBe(380);
  });

  it("shouldRejectStaleListPaymentSync blocks list rollback after mark paid", () => {
    expect(
      shouldRejectStaleListPaymentSync(
        { payment_status: "paid", balance_due: 0, amount_paid: 200, is_invoiced: true },
        { payment_status: "pending", balance_due: 200, amount_paid: 0, is_invoiced: true },
      ),
    ).toBe(true);
    expect(
      shouldRejectStaleListPaymentSync(
        { payment_status: "pending", balance_due: 200, amount_paid: 0, is_invoiced: true },
        { payment_status: "paid", balance_due: 0, amount_paid: 200, is_invoiced: true },
      ),
    ).toBe(false);
  });
});
