import {
  groupPaymentBadge,
  groupPayerSummaryLine,
  participantPaymentBadge,
} from "@/lib/group-booking-payment-display";

describe("groupPaymentBadge", () => {
  it("maps rollup statuses including partially_paid and not_invoiced", () => {
    expect(groupPaymentBadge("paid")?.label).toBe("Paid");
    expect(groupPaymentBadge("partially_paid")?.label).toBe("Partially paid");
    expect(groupPaymentBadge("not_invoiced")?.label).toBe("Not invoiced");
    expect(groupPaymentBadge("partially_refunded")?.label).toBe("Partially refunded");
  });
});

describe("participantPaymentBadge", () => {
  it("shows Covered when group balance is settled even if child is pending", () => {
    const badge = participantPaymentBadge("pending", 0);
    expect(badge?.label).toBe("Covered");
  });

  it("shows real participant status when group balance remains", () => {
    expect(participantPaymentBadge("pending", 120)?.label).toBe("Unpaid");
    expect(participantPaymentBadge("paid", 50)?.label).toBe("Paid");
  });
});

describe("groupPayerSummaryLine", () => {
  it("returns organiser-first copy", () => {
    expect(groupPayerSummaryLine({ isPrimaryPayer: true, paidBy: "Jane" })).toBe(
      "You paid for the group",
    );
    expect(groupPayerSummaryLine({ isPrimaryPayer: false, paidBy: "Jane Doe" })).toBe(
      "Paid by Jane Doe",
    );
    expect(groupPayerSummaryLine({ isPrimaryPayer: false, paidBy: null })).toBeNull();
  });
});
